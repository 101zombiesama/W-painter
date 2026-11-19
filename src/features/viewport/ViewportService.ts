import {
  Group,
  MOUSE,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Triangle,
  Vector2,
  Vector3,
  WebGLRenderer,
  type BufferAttribute,
  type Mesh,
  type Object3D,
  type Sphere,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { createStore, type StoreApi } from 'zustand/vanilla'
import { GpuContext } from '@/core/gpu/GpuContext'

/** A point on a mesh surface under the pointer. */
export interface SurfaceHit {
  object: Mesh
  point: Vector3
  /** Interpolated (smooth) surface normal, facing the viewer. */
  normal: Vector3
  uv: Vector2 | null
  distance: number
}

/** An in-progress pointer drag that a feature has claimed. */
export interface Gesture {
  move(event: PointerEvent): void
  end(event: PointerEvent, cancelled: boolean): void
}

/**
 * Gets first refusal on pointer-down events in the viewport. Return a Gesture
 * to claim the drag; return null to let lower-priority handlers (and finally
 * the camera controls) have it.
 */
export interface GestureHandler {
  begin(event: PointerEvent): Gesture | null
}

/** A unit of per-frame work. Return true when the scene needs redrawing. */
export type FrameTask = () => boolean

export interface ViewportStats {
  fps: number
  frameMs: number
  drawCalls: number
  triangles: number
}

interface Ordered<T> {
  value: T
  order: number
}

const _a = new Vector3()
const _b = new Vector3()
const _c = new Vector3()
const _bary = new Vector3()
const _ndc = new Vector2()

/**
 * Owns the WebGL renderer, the 3D scene, the camera and the frame loop.
 *
 * Rendering is on-demand: a frame is drawn only when something asks for it
 * (`requestRender`), a frame task reports a change, or the camera is moving.
 */
export class ViewportService {
  readonly canvas: HTMLCanvasElement
  readonly renderer: WebGLRenderer
  readonly gpu: GpuContext
  readonly scene = new Scene()
  readonly camera = new PerspectiveCamera(35, 1, 0.01, 200)
  readonly controls: OrbitControls
  /** Paintable model meshes. */
  readonly content = new Group()
  /** Helpers drawn on top of the model (cursors, gizmos). */
  readonly overlay = new Group()
  readonly stats: StoreApi<ViewportStats> = createStore<ViewportStats>(() => ({
    fps: 0,
    frameMs: 0,
    drawCalls: 0,
    triangles: 0,
  }))

  private readonly raycaster = new Raycaster()
  private readonly frameTasks: Ordered<FrameTask>[] = []
  private readonly gestureHandlers: Ordered<GestureHandler>[] = []
  private readonly hoverListeners = new Set<(event: PointerEvent | null) => void>()
  private activeGesture: { gesture: Gesture; pointerId: number } | null = null
  private container: HTMLElement | null = null
  private needsRender = true
  private rafId = 0
  private frameCount = 0
  private frameTimeSum = 0
  private lastStatsTime = 0

  constructor() {
    this.canvas = document.createElement('canvas')
    this.canvas.style.display = 'block'
    this.canvas.style.width = '100%'
    this.canvas.style.height = '100%'
    this.canvas.style.outline = 'none'

    this.renderer = new WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.gpu = new GpuContext(this.renderer)

    this.raycaster.firstHitOnly = true

    this.camera.position.set(2.2, 1.4, 3.2)
    this.scene.add(this.content, this.overlay)

    this.controls = new OrbitControls(this.camera, this.canvas)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.14
    this.controls.zoomToCursor = true
    this.controls.minDistance = 0.05
    this.controls.maxDistance = 60
    // Left-drag orbits (when no tool claims it), middle pans, right orbits.
    this.controls.mouseButtons = { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.PAN, RIGHT: MOUSE.ROTATE }

    this.rafId = requestAnimationFrame(this.loop)
  }

  // --- lifecycle ----------------------------------------------------------

  /** Attaches the canvas to a DOM container. Returns a cleanup function. */
  mount(container: HTMLElement): () => void {
    this.container = container
    container.appendChild(this.canvas)

    const resize = () => {
      const width = Math.max(1, container.clientWidth)
      const height = Math.max(1, container.clientHeight)
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
      this.renderer.setSize(width, height, false)
      this.camera.aspect = width / height
      this.camera.updateProjectionMatrix()
      this.requestRender()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(container)
    resize()

    const onContextMenu = (event: Event) => event.preventDefault()
    const onLeave = () => this.emitHover(null)
    // Capture phase: runs before OrbitControls' listener on the canvas.
    container.addEventListener('pointerdown', this.onPointerDown, { capture: true })
    container.addEventListener('pointermove', this.onPointerMove)
    container.addEventListener('pointerup', this.onPointerUp)
    container.addEventListener('pointercancel', this.onPointerUp)
    container.addEventListener('pointerleave', onLeave)
    container.addEventListener('contextmenu', onContextMenu)

    return () => {
      observer.disconnect()
      container.removeEventListener('pointerdown', this.onPointerDown, { capture: true })
      container.removeEventListener('pointermove', this.onPointerMove)
      container.removeEventListener('pointerup', this.onPointerUp)
      container.removeEventListener('pointercancel', this.onPointerUp)
      container.removeEventListener('pointerleave', onLeave)
      container.removeEventListener('contextmenu', onContextMenu)
      if (this.canvas.parentElement === container) container.removeChild(this.canvas)
      this.container = null
    }
  }

  dispose(): void {
    cancelAnimationFrame(this.rafId)
    this.controls.dispose()
    this.renderer.dispose()
  }

  // --- frame loop ---------------------------------------------------------

  requestRender(): void {
    this.needsRender = true
  }

  /** Registers per-frame work. Lower `order` runs first. */
  addFrameTask(task: FrameTask, order = 0): () => void {
    const entry = { value: task, order }
    this.frameTasks.push(entry)
    this.frameTasks.sort((x, y) => x.order - y.order)
    return () => {
      const index = this.frameTasks.indexOf(entry)
      if (index >= 0) this.frameTasks.splice(index, 1)
    }
  }

  private readonly loop = (time: number): void => {
    this.rafId = requestAnimationFrame(this.loop)

    const start = performance.now()
    let dirty = this.needsRender
    let ranGpuWork = false
    for (const task of this.frameTasks) {
      if (task.value()) {
        dirty = true
        ranGpuWork = true
      }
    }
    if (ranGpuWork) this.gpu.end()
    if (this.controls.update()) dirty = true

    if (dirty) {
      this.needsRender = false
      this.renderer.setRenderTarget(null)
      this.renderer.render(this.scene, this.camera)
      this.frameCount += 1
      this.frameTimeSum += performance.now() - start
    }

    if (time - this.lastStatsTime > 500) {
      const seconds = (time - this.lastStatsTime) / 1000
      const info = this.renderer.info.render
      this.stats.setState({
        fps: Math.round(this.frameCount / seconds),
        frameMs: this.frameCount > 0 ? this.frameTimeSum / this.frameCount : 0,
        drawCalls: info.calls,
        triangles: info.triangles,
      })
      this.frameCount = 0
      this.frameTimeSum = 0
      this.lastStatsTime = time
    }
  }

  // --- pointer routing ----------------------------------------------------

  /** Registers a gesture handler. Higher `priority` is asked first. */
  addGestureHandler(handler: GestureHandler, priority = 0): () => void {
    const entry = { value: handler, order: -priority }
    this.gestureHandlers.push(entry)
    this.gestureHandlers.sort((x, y) => x.order - y.order)
    return () => {
      const index = this.gestureHandlers.indexOf(entry)
      if (index >= 0) this.gestureHandlers.splice(index, 1)
    }
  }

  /** Pointer movement over the viewport while no gesture is active (null = left). */
  addHoverListener(listener: (event: PointerEvent | null) => void): () => void {
    this.hoverListeners.add(listener)
    return () => this.hoverListeners.delete(listener)
  }

  private emitHover(event: PointerEvent | null): void {
    for (const listener of this.hoverListeners) listener(event)
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (this.activeGesture) return
    for (const handler of this.gestureHandlers) {
      const gesture = handler.value.begin(event)
      if (!gesture) continue
      // Claimed: keep the camera controls from also reacting to this drag.
      event.stopPropagation()
      event.preventDefault()
      this.activeGesture = { gesture, pointerId: event.pointerId }
      this.container?.setPointerCapture(event.pointerId)
      return
    }
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    const active = this.activeGesture
    if (!active) {
      // Skip hover work while the camera controls own a drag.
      if (event.buttons === 0) this.emitHover(event)
      return
    }
    if (active.pointerId !== event.pointerId) return
    // Coalesced events give full-rate pen/mouse samples for smooth strokes.
    const samples = event.getCoalescedEvents?.() ?? []
    if (samples.length > 0) {
      for (const sample of samples) active.gesture.move(sample)
    } else {
      active.gesture.move(event)
    }
  }

  private readonly onPointerUp = (event: PointerEvent): void => {
    const active = this.activeGesture
    if (!active || active.pointerId !== event.pointerId) return
    this.activeGesture = null
    if (this.container?.hasPointerCapture(event.pointerId)) {
      this.container.releasePointerCapture(event.pointerId)
    }
    active.gesture.end(event, event.type === 'pointercancel')
  }

  // --- picking ------------------------------------------------------------

  /** Size of the drawing area in CSS pixels. */
  getSize(): { width: number; height: number } {
    return { width: this.canvas.clientWidth || 1, height: this.canvas.clientHeight || 1 }
  }

  /** Raycasts from a client-space pointer position into the model. */
  pick(clientX: number, clientY: number, objects?: Object3D[]): SurfaceHit | null {
    const rect = this.canvas.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return null
    _ndc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    )
    this.raycaster.setFromCamera(_ndc, this.camera)
    const hits = this.raycaster.intersectObjects(objects ?? this.content.children, true)
    const hit = hits[0]
    if (!hit || !hit.face) return null

    const mesh = hit.object as Mesh
    const geometry = mesh.geometry
    const position = geometry.getAttribute('position') as BufferAttribute
    const normalAttr = geometry.getAttribute('normal') as BufferAttribute | undefined
    const uvAttr = geometry.getAttribute('uv') as BufferAttribute | undefined
    const { a, b, c } = hit.face

    // Model meshes carry identity transforms, so object space == world space.
    _a.fromBufferAttribute(position, a)
    _b.fromBufferAttribute(position, b)
    _c.fromBufferAttribute(position, c)
    Triangle.getBarycoord(hit.point, _a, _b, _c, _bary)

    const normal = new Vector3()
    if (normalAttr) {
      normal
        .set(0, 0, 0)
        .addScaledVector(_a.fromBufferAttribute(normalAttr, a), _bary.x)
        .addScaledVector(_b.fromBufferAttribute(normalAttr, b), _bary.y)
        .addScaledVector(_c.fromBufferAttribute(normalAttr, c), _bary.z)
    }
    if (normal.lengthSq() < 1e-12) normal.copy(hit.face.normal)
    normal.normalize()
    if (normal.dot(this.raycaster.ray.direction) > 0) normal.negate()

    let uv: Vector2 | null = null
    if (uvAttr) {
      uv = new Vector2(
        uvAttr.getX(a) * _bary.x + uvAttr.getX(b) * _bary.y + uvAttr.getX(c) * _bary.z,
        uvAttr.getY(a) * _bary.x + uvAttr.getY(b) * _bary.y + uvAttr.getY(c) * _bary.z,
      )
    }

    return { object: mesh, point: hit.point.clone(), normal, uv, distance: hit.distance }
  }

  /** World-space size of one CSS pixel at a given distance from the camera. */
  worldUnitsPerPixel(distance: number): number {
    const { height } = this.getSize()
    return (2 * distance * Math.tan((this.camera.fov * Math.PI) / 360)) / height
  }

  // --- camera -------------------------------------------------------------

  /** Moves the camera so the sphere fills the view, keeping the view direction. */
  frame(sphere: Sphere): void {
    const direction = _a.copy(this.camera.position).sub(this.controls.target)
    if (direction.lengthSq() < 1e-8) direction.set(0.5, 0.35, 1)
    direction.normalize()
    const halfFov = (Math.min(this.camera.fov, this.camera.fov * this.camera.aspect) * Math.PI) / 360
    const distance = (sphere.radius / Math.sin(Math.max(halfFov, 0.1))) * 1.08
    this.controls.target.copy(sphere.center)
    this.camera.position.copy(sphere.center).addScaledVector(direction, distance)
    this.camera.near = Math.max(0.001, distance / 500)
    this.camera.far = distance * 100
    this.camera.updateProjectionMatrix()
    this.controls.update()
    this.requestRender()
  }
}
