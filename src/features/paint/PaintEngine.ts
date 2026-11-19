import { Vector3, type RawShaderMaterial, type WebGLRenderTarget } from 'three'
import type { AppContext } from '@/core/app/feature'
import type { GpuContext } from '@/core/gpu/GpuContext'
import { unionRect, type PxRect } from '@/core/gpu/Rect'
import { createTarget, targetFormat } from '@/core/gpu/targets'
import { DisposableStore } from '@/core/utils/disposable'
import { clamp, linearToSrgb, type RGB } from '@/core/utils/math'
import type { LayerService } from '@/features/layers/LayerService'
import type { StrokeDescriptor } from '@/features/layers/types'
import { CHANNEL_IDS, type ChannelId } from '@/features/project/channels'
import type { ProjectService } from '@/features/project/ProjectService'
import type { TextureSet } from '@/features/project/TextureSet'
import type { Gesture, GestureHandler, SurfaceHit, ViewportService } from '@/features/viewport'
import { notify } from '@/shared/ui/toast'
import { BrushCursor } from './BrushCursor'
import { createDabMaterial, MAX_DABS } from './dabShader'
import type { BrushSettings, PaintActions, PaintStore, SymmetryAxis } from './store'
import type { BrushTip, BrushTipProvider } from './tips'

/** Brush volume reach relative to its radius: square tip corners plus depth. */
const DAB_REACH = 1.75
/** Guard against pathological input (e.g. a huge jump with tiny spacing). */
const MAX_DABS_PER_SAMPLE = 400

const AXIS_INDEX: Record<SymmetryAxis, number> = { x: 0, y: 1, z: 2 }

interface Dab {
  position: Vector3
  normal: Vector3
  tangent: Vector3
  bitangent: Vector3
  radius: number
  flow: number
  lod: number
}

interface ActiveStroke {
  textureSet: TextureSet
  brush: BrushSettings
  tip: BrushTip | null
  /** Stamp tool: one dab on pointer-down, nothing while dragging. */
  single: boolean
  symmetryAxis: SymmetryAxis | null
  queue: Dab[]
  /** Union of every rectangle the stroke has touched. */
  rect: PxRect | null
  lastX: number
  lastY: number
  lastPressure: number
  lastPoint: Vector3 | null
  /** Distance travelled since the last dab, in world units. */
  carry: number
  /** Stabilized pointer position (lazy mouse). */
  lazyX: number
  lazyY: number
  direction: Vector3
}

const NOOP_GESTURE: Gesture = { move() {}, end() {} }

const _right = new Vector3()
const _up = new Vector3()
const _toCamera = new Vector3()
const _v = new Vector3()

/**
 * Turns pointer input into brush strokes.
 *
 * Pointer samples are resampled into evenly spaced dabs (raycast onto the
 * model), queued, and rendered into a stroke buffer once per frame. The
 * layers feature previews that buffer live and bakes it when the stroke ends.
 */
export class PaintEngine implements GestureHandler {
  private readonly viewport: ViewportService
  private readonly project: ProjectService
  private readonly layers: LayerService
  private readonly gpu: GpuContext
  private readonly store: PaintStore
  private readonly actions: PaintActions
  private readonly dabMaterial: RawShaderMaterial
  private readonly cursor = new BrushCursor()
  private readonly disposables = new DisposableStore()
  private readonly spheres = new Float32Array(MAX_DABS * 4)
  private tipProvider: BrushTipProvider | null = null
  private strokeTarget: WebGLRenderTarget | null = null
  private pickTarget: WebGLRenderTarget | null = null
  private stroke: ActiveStroke | null = null
  private random = Math.random

  constructor(ctx: AppContext, store: PaintStore, actions: PaintActions) {
    this.viewport = ctx.services.get('viewport')
    this.project = ctx.services.get('project')
    this.layers = ctx.services.get('layers')
    this.gpu = this.viewport.gpu
    this.store = store
    this.actions = actions
    this.dabMaterial = createDabMaterial()

    this.viewport.overlay.add(this.cursor.object)
    this.disposables.add(this.viewport.addGestureHandler(this, 10))
    this.disposables.add(this.viewport.addHoverListener((event) => this.onHover(event)))
    this.disposables.add(this.viewport.addFrameTask(() => this.flush(), 0))
    this.disposables.add(
      ctx.events.on('project:textureSetRemoved', (set) => {
        if (this.stroke?.textureSet === set) this.stroke = null
      }),
    )
    // Brush size can change from shortcuts while hovering; keep the ring in sync.
    this.disposables.add(
      store.subscribe((state, previous) => {
        if (state.brush.size !== previous.brush.size && this.cursor.object.visible) {
          this.cursor.object.scale.setScalar(state.brush.size)
          this.viewport.requestRender()
        }
        if (state.tool !== previous.tool && this.cursor.hide()) this.viewport.requestRender()
      }),
    )
  }

  setTipProvider(provider: BrushTipProvider): void {
    this.tipProvider = provider
  }

  /** Name and thumbnail of a brush tip or stamp, for display. */
  describeTip(id: string): { name: string; thumbnail: string } | null {
    return this.tipProvider?.describe(id) ?? null
  }

  dispose(): void {
    this.disposables.dispose()
    this.viewport.overlay.remove(this.cursor.object)
    this.cursor.dispose()
    this.dabMaterial.dispose()
    this.strokeTarget?.dispose()
    this.pickTarget?.dispose()
  }

  // --- gesture handling -----------------------------------------------------

  begin(event: PointerEvent): Gesture | null {
    // Alt-drag, non-primary buttons and touch belong to camera navigation.
    if (event.button !== 0 || event.altKey || event.pointerType === 'touch') return null
    const hit = this.viewport.pick(event.clientX, event.clientY)
    if (!hit) return null // Dragging on empty space orbits the camera.

    const state = this.store.getState()
    const hitSetId = hit.object.userData.textureSetId as string | undefined
    const hitSet = hitSetId ? this.project.find(hitSetId) : null
    if (!hitSet) return null

    if (state.tool === 'picker') {
      this.pickMaterial(hitSet, hit)
      return NOOP_GESTURE
    }

    // Painting follows the click: touching another texture set makes it active.
    if (this.project.active !== hitSet) this.project.setActive(hitSet.id)

    const target = this.layers.resolvePaintTarget(hitSet.id)
    if (!target.ok) {
      notify(target.reason, 'warning')
      return NOOP_GESTURE
    }

    const erase = state.tool === 'erase'
    const channels: Partial<Record<ChannelId, RGB>> = {}
    for (const id of CHANNEL_IDS) {
      // The eraser clears every channel; the brush only paints enabled ones.
      if (erase || state.material[id].enabled) channels[id] = state.material[id].value
    }
    if (target.target === 'content' && Object.keys(channels).length === 0) {
      notify('Enable at least one channel in the Material panel to paint.', 'warning')
      return NOOP_GESTURE
    }

    const isStamp = state.tool === 'stamp'
    const tipId = isStamp ? state.stampId : state.brush.tipId === 'round' ? null : state.brush.tipId
    const tip = tipId ? (this.tipProvider?.getTip(tipId) ?? null) : null
    if (isStamp && !tip) {
      notify('Pick a stamp from the shelf first.', 'warning')
      return NOOP_GESTURE
    }
    const tinted = tip?.tinted ?? false

    const target16 = this.ensureStrokeTarget(hitSet.resolution, tinted)
    this.gpu.fill(target16, 0, 0, 0, 0)

    const descriptor: StrokeDescriptor = {
      textureSet: hitSet,
      layerId: target.layer.id,
      target: target.target,
      texture: target16.texture,
      tinted,
      mode: erase ? 'erase' : 'paint',
      opacity: state.brush.opacity,
      channels,
      maskValue: state.maskValue,
    }
    this.layers.beginStroke(descriptor)

    // Stamps are placed exactly as configured: full strength, no jitter.
    const brush: BrushSettings = isStamp
      ? {
          ...state.brush,
          flow: 1,
          sizeJitter: 0,
          angleJitter: 0,
          flowJitter: 0,
          scatter: 0,
          followStroke: false,
          pressureSize: false,
          pressureFlow: false,
          smoothing: 0,
        }
      : state.brush

    const pressure = pointerPressure(event)
    const stroke: ActiveStroke = {
      textureSet: hitSet,
      brush,
      tip,
      single: isStamp,
      symmetryAxis: state.symmetry.enabled ? state.symmetry.axis : null,
      queue: [],
      rect: null,
      lastX: event.clientX,
      lastY: event.clientY,
      lastPressure: pressure,
      lastPoint: hit.point.clone(),
      carry: 0,
      lazyX: event.clientX,
      lazyY: event.clientY,
      direction: new Vector3(),
    }
    this.stroke = stroke
    this.configureDabMaterial(stroke)
    this.emitDab(stroke, hit, pressure)
    this.updateCursor(hit, brush)

    return {
      move: (e) => this.onStrokeMove(e),
      end: () => this.finishStroke(),
    }
  }

  private onStrokeMove(event: PointerEvent): void {
    const stroke = this.stroke
    if (!stroke) return
    let x = event.clientX
    let y = event.clientY

    // Lazy mouse: the brush is dragged on a virtual string of fixed length.
    const lazyRadius = stroke.brush.smoothing
    if (lazyRadius > 0) {
      const dx = x - stroke.lazyX
      const dy = y - stroke.lazyY
      const distance = Math.hypot(dx, dy)
      if (distance <= lazyRadius) return
      const pull = (distance - lazyRadius) / distance
      stroke.lazyX += dx * pull
      stroke.lazyY += dy * pull
      x = stroke.lazyX
      y = stroke.lazyY
    }

    const pressure = pointerPressure(event)
    const hit = this.pickOn(stroke.textureSet, x, y)
    if (hit) this.updateCursor(hit, stroke.brush)

    if (stroke.single) return

    if (!hit) {
      // Left the surface: restart spacing when the pointer comes back.
      stroke.lastPoint = null
    } else if (!stroke.lastPoint) {
      this.emitDab(stroke, hit, pressure)
      stroke.carry = 0
      stroke.lastPoint = hit.point.clone()
    } else {
      const segment = hit.point.distanceTo(stroke.lastPoint)
      const radius = stroke.brush.size
      const spacing = Math.max(radius * 2 * stroke.brush.spacing, radius * 0.01)
      const travelled = stroke.carry + segment
      if (segment > 1e-7) stroke.direction.copy(hit.point).sub(stroke.lastPoint).normalize()

      if (travelled >= spacing && segment > 1e-7) {
        const count = Math.min(Math.floor(travelled / spacing), MAX_DABS_PER_SAMPLE)
        for (let k = 1; k <= count; k++) {
          const t = clamp((k * spacing - stroke.carry) / segment, 0, 1)
          const sx = stroke.lastX + (x - stroke.lastX) * t
          const sy = stroke.lastY + (y - stroke.lastY) * t
          const dabHit = t >= 0.999 ? hit : this.pickOn(stroke.textureSet, sx, sy)
          if (dabHit) {
            this.emitDab(stroke, dabHit, stroke.lastPressure + (pressure - stroke.lastPressure) * t)
          }
        }
        stroke.carry = travelled - count * spacing
      } else {
        stroke.carry = travelled
      }
      stroke.lastPoint.copy(hit.point)
    }

    stroke.lastX = x
    stroke.lastY = y
    stroke.lastPressure = pressure
  }

  private finishStroke(): void {
    const stroke = this.stroke
    if (!stroke) return
    this.flush()
    this.stroke = null
    this.layers.endStroke(stroke.rect)
    this.gpu.end()
    this.viewport.requestRender()
  }

  // --- dab generation -------------------------------------------------------

  private emitDab(stroke: ActiveStroke, hit: SurfaceHit, pressure: number): void {
    const brush = stroke.brush
    const camera = this.viewport.camera
    const rand = this.random

    let radius = brush.size
    if (brush.pressureSize) radius *= 0.2 + 0.8 * pressure
    if (brush.sizeJitter > 0) radius *= 1 - rand() * brush.sizeJitter
    radius = Math.max(radius, 1e-4)

    let flow = brush.flow
    if (brush.pressureFlow) flow *= pressure
    if (brush.flowJitter > 0) flow *= 1 - rand() * brush.flowJitter

    let angle = (brush.angle * Math.PI) / 180
    if (brush.angleJitter > 0) angle += (rand() * 2 - 1) * Math.PI * brush.angleJitter

    // Build the brush frame: normal out of the surface, tangent to screen-right.
    _right.setFromMatrixColumn(camera.matrixWorld, 0)
    _up.setFromMatrixColumn(camera.matrixWorld, 1)
    const normal = new Vector3()
    if (brush.alignment === 'camera') {
      normal.copy(camera.getWorldDirection(_toCamera)).negate()
    } else {
      normal.copy(hit.normal)
    }

    const tangent = new Vector3()
    if (brush.followStroke && stroke.direction.lengthSq() > 0.5) {
      tangent.copy(stroke.direction)
    } else {
      tangent.copy(_right)
    }
    tangent.addScaledVector(normal, -tangent.dot(normal))
    if (tangent.lengthSq() < 1e-6) {
      tangent.copy(_up).addScaledVector(normal, -_up.dot(normal))
    }
    tangent.normalize()
    const bitangent = new Vector3().crossVectors(normal, tangent)

    if (angle !== 0) {
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)
      _v.copy(tangent)
      tangent.multiplyScalar(cos).addScaledVector(bitangent, sin)
      bitangent.multiplyScalar(cos).addScaledVector(_v, -sin)
    }

    const position = hit.point.clone()
    if (brush.scatter > 0) {
      const reach = radius * 2 * brush.scatter
      position
        .addScaledVector(tangent, (rand() * 2 - 1) * reach)
        .addScaledVector(bitangent, (rand() * 2 - 1) * reach)
    }

    // Pick the tip mip whose texels roughly match the surface texels it covers.
    let lod = 0
    if (stroke.tip) {
      const dabTexels = Math.max(1, radius * 2 * stroke.textureSet.texelsPerWorldUnit)
      lod = Math.max(0, Math.log2(stroke.tip.size / dabTexels))
    }

    const dab: Dab = { position, normal, tangent, bitangent, radius, flow, lod }
    stroke.queue.push(dab)

    if (stroke.symmetryAxis) {
      const axis = AXIS_INDEX[stroke.symmetryAxis]
      stroke.queue.push({
        position: mirror(position, axis),
        normal: mirror(normal, axis),
        tangent: mirror(tangent, axis),
        bitangent: mirror(bitangent, axis),
        radius,
        flow,
        lod,
      })
    }
  }

  /** Frame task: renders queued dabs into the stroke buffer. */
  private flush(): boolean {
    const stroke = this.stroke
    const target = this.strokeTarget
    if (!stroke || !target || stroke.queue.length === 0) return false

    const set = stroke.textureSet
    const u = this.dabMaterial.uniforms
    const a = u.uDabA.value as Float32Array
    const b = u.uDabB.value as Float32Array
    const c = u.uDabC.value as Float32Array
    const d = u.uDabD.value as Float32Array
    const queue = stroke.queue

    for (let start = 0; start < queue.length; start += MAX_DABS) {
      const count = Math.min(MAX_DABS, queue.length - start)
      for (let i = 0; i < count; i++) {
        const dab = queue[start + i]
        const o = i * 4
        a[o] = dab.position.x; a[o + 1] = dab.position.y; a[o + 2] = dab.position.z; a[o + 3] = dab.radius
        b[o] = dab.normal.x; b[o + 1] = dab.normal.y; b[o + 2] = dab.normal.z; b[o + 3] = dab.flow
        c[o] = dab.tangent.x; c[o + 1] = dab.tangent.y; c[o + 2] = dab.tangent.z; c[o + 3] = dab.lod
        d[o] = dab.bitangent.x; d[o + 1] = dab.bitangent.y; d[o + 2] = dab.bitangent.z; d[o + 3] = 0
        this.spheres[o] = dab.position.x
        this.spheres[o + 1] = dab.position.y
        this.spheres[o + 2] = dab.position.z
        this.spheres[o + 3] = dab.radius * DAB_REACH
      }

      // Only the part of the texture near these dabs is processed.
      const tiles = set.tiles.query(this.spheres, count)
      if (!tiles) continue
      const rect = set.rectFromTiles(tiles)
      u.uCount.value = count
      this.gpu.pass(this.dabMaterial, target, rect)
      stroke.rect = unionRect(stroke.rect, rect)
      this.layers.strokeChanged(rect)
    }
    queue.length = 0
    return true
  }

  private configureDabMaterial(stroke: ActiveStroke): void {
    const set = stroke.textureSet
    const brush = stroke.brush
    const u = this.dabMaterial.uniforms
    u.tPosition.value = set.surface.position.texture
    u.tNormal.value = set.surface.normal.texture
    u.tTip.value = stroke.tip?.texture ?? null
    u.uUseTip.value = stroke.tip ? 1 : 0
    u.uTinted.value = stroke.tip?.tinted ? 1 : 0
    u.uBackface.value = brush.backfaceCulling ? 1 : 0
    // Keep at least ~1.5 texels of falloff so hard edges are anti-aliased.
    const edge = clamp(1.5 / Math.max(1, brush.size * set.texelsPerWorldUnit), 0.004, 0.5)
    u.uHardness.value = Math.min(brush.hardness, 1 - edge)
  }

  private ensureStrokeTarget(size: number, tinted: boolean): WebGLRenderTarget {
    const format = tinted ? 'rgba16f' : 'r16f'
    const current = this.strokeTarget
    if (current && current.width === size && targetFormat(current) === format) return current
    current?.dispose()
    this.strokeTarget = createTarget(size, size, format)
    return this.strokeTarget
  }

  // --- hover / cursor -------------------------------------------------------

  private onHover(event: PointerEvent | null): void {
    const state = this.store.getState()
    if (!event || state.tool === 'picker' || event.pointerType === 'touch') {
      if (this.cursor.hide()) this.viewport.requestRender()
      return
    }
    const hit = this.viewport.pick(event.clientX, event.clientY)
    if (hit) {
      this.updateCursor(hit, state.brush)
    } else if (this.cursor.hide()) {
      this.viewport.requestRender()
    }
  }

  private updateCursor(hit: SurfaceHit, brush: BrushSettings): void {
    let normal = hit.normal
    if (brush.alignment === 'camera') {
      normal = this.viewport.camera.getWorldDirection(_toCamera).negate()
    }
    this.cursor.update(hit.point, normal, brush.size)
    this.viewport.requestRender()
  }

  private pickOn(set: TextureSet, x: number, y: number): SurfaceHit | null {
    const hit = this.viewport.pick(x, y)
    return hit && hit.object === set.mesh ? hit : null
  }

  // --- eyedropper -----------------------------------------------------------

  /** Loads the flattened material under the pointer onto the brush. */
  private pickMaterial(set: TextureSet, hit: SurfaceHit): void {
    if (!hit.uv) return
    const size = set.resolution
    const px = clamp(Math.floor(hit.uv.x * size), 0, size - 1)
    const py = clamp(Math.floor(hit.uv.y * size), 0, size - 1)
    this.pickTarget ??= createTarget(1, 1, 'rgba8')
    const read = (channel: ChannelId): Uint8Array => {
      this.gpu.copyRect(
        set.output(channel).texture,
        size,
        size,
        { x: px, y: py, w: 1, h: 1 },
        this.pickTarget!,
        { x: 0, y: 0, w: 1, h: 1 },
      )
      return this.gpu.readPixels(this.pickTarget!)
    }

    // The base color output is an sRGB texture, so the copy holds linear values.
    const color = read('baseColor')
    const rough = read('roughness')[0] / 255
    const metal = read('metallic')[0] / 255
    this.gpu.end()

    this.actions.setChannel('baseColor', {
      value: [linearToSrgb(color[0] / 255), linearToSrgb(color[1] / 255), linearToSrgb(color[2] / 255)],
    })
    this.actions.setChannel('roughness', { value: [rough, rough, rough] })
    this.actions.setChannel('metallic', { value: [metal, metal, metal] })
    notify('Picked material from surface.', 'info')
  }
}

function pointerPressure(event: PointerEvent): number {
  // Mice report a constant 0.5 while pressed; treat them as full pressure.
  return event.pointerType === 'pen' ? clamp(event.pressure, 0.02, 1) : 1
}

function mirror(v: Vector3, axis: number): Vector3 {
  const out = v.clone()
  out.setComponent(axis, -out.getComponent(axis))
  return out
}
