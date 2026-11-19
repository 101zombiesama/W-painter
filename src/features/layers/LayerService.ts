import { Vector3, Vector4, type RawShaderMaterial } from 'three'
import { createStore, type StoreApi } from 'zustand/vanilla'
import type { AppContext } from '@/core/app/feature'
import { createPassMaterial, type GpuContext } from '@/core/gpu/GpuContext'
import { fullRect, type PxRect } from '@/core/gpu/Rect'
import { DisposableStore } from '@/core/utils/disposable'
import { createId } from '@/core/utils/id'
import type { RGB } from '@/core/utils/math'
import { CHANNEL_IDS, getChannel, mapChannels, type ChannelId } from '@/features/project/channels'
import type { ProjectService } from '@/features/project/ProjectService'
import type { TextureSet } from '@/features/project/TextureSet'
import type { ViewportService } from '@/features/viewport'
import {
  capturePatch,
  isLayerReferencing,
  LayerStackCommand,
  TexturePatchCommand,
  type TexturePatch,
} from './commands'
import { Compositor, type LayerSource } from './Compositor'
import { LayerTextures } from './LayerTextures'
import { BAKE_STROKE_FRAGMENT, INVERT_MASK_FRAGMENT } from './shaders/glsl'
import type {
  FillChannel,
  LayerChannelSettings,
  LayerData,
  LayersState,
  LayerStack,
  PaintTarget,
  StrokeDescriptor,
} from './types'

export type PaintTargetResolution =
  | { ok: true; layer: LayerData; target: PaintTarget }
  | { ok: false; reason: string }

interface MutateOptions {
  /** Channels whose flattened result changes (default: all). */
  channels?: readonly ChannelId[]
  /** false = part of a continuous edit (slider drag); call `commitEdit` when it ends. */
  commit?: boolean
  /** false = not undoable (selection changes). */
  history?: boolean
}

const FILL_DEFAULTS: Record<ChannelId, FillChannel> = {
  baseColor: { enabled: true, value: [0.62, 0.62, 0.62] },
  height: { enabled: false, value: [0, 0, 0] },
  roughness: { enabled: true, value: [0.5, 0.5, 0.5] },
  metallic: { enabled: true, value: [0, 0, 0] },
  emissive: { enabled: false, value: [0, 0, 0] },
  ao: { enabled: false, value: [1, 1, 1] },
}

/**
 * The layer stack of every texture set: structure, properties, pixel storage,
 * masks, and how brush strokes are previewed and committed. All mutations go
 * through this service so that undo history and compositing stay in sync.
 */
export class LayerService implements LayerSource {
  readonly store: StoreApi<LayersState> = createStore<LayersState>(() => ({
    stacks: {},
    channelContext: 'baseColor',
  }))
  readonly compositor: Compositor

  private readonly ctx: AppContext
  private readonly gpu: GpuContext
  private readonly project: ProjectService
  private readonly viewport: ViewportService
  private readonly textures = new Map<string, LayerTextures>()
  private readonly bakeMaterials = new Map<string, RawShaderMaterial>()
  private readonly invertMaterial: RawShaderMaterial
  private readonly disposables = new DisposableStore()
  private pendingEdit: { textureSetId: string; label: string; before: LayerStack } | null = null
  private stroke: { descriptor: StrokeDescriptor; channels: ChannelId[] } | null = null
  private layerCounter = 0

  constructor(ctx: AppContext) {
    this.ctx = ctx
    this.viewport = ctx.services.get('viewport')
    this.project = ctx.services.get('project')
    this.gpu = this.viewport.gpu
    this.compositor = new Compositor(this.gpu, this)
    this.invertMaterial = createPassMaterial(INVERT_MASK_FRAGMENT, { tSource: { value: null } })

    const { events, history } = ctx
    this.disposables.add(events.on('project:textureSetAdded', (set) => this.onTextureSetAdded(set)))
    this.disposables.add(events.on('project:textureSetRemoved', (set) => this.onTextureSetRemoved(set)))
    this.disposables.add(
      events.on('project:textureSetResizing', ({ textureSet, resolution }) => {
        this.textures.get(textureSet.id)?.resize(resolution)
      }),
    )
    this.disposables.add(
      events.on('project:textureSetResized', (set) => {
        this.compositor.trimScratch(new Set(this.project.textureSets.map((s) => s.resolution)))
        this.compositor.invalidate(set)
      }),
    )
    this.disposables.add(
      events.on('project:textureSetChanged', (set) => {
        this.compositor.invalidate(set, ['height'])
        this.viewport.requestRender()
      }),
    )
    this.disposables.add(history.onEviction(() => this.collectGarbage()))
    // Composite after the paint engine (order 0) has rendered this frame's dabs.
    this.disposables.add(this.viewport.addFrameTask(() => this.compositor.flush(), 10))
  }

  dispose(): void {
    this.disposables.dispose()
    for (const textures of this.textures.values()) textures.dispose()
    this.textures.clear()
    for (const material of this.bakeMaterials.values()) material.dispose()
    this.invertMaterial.dispose()
    this.compositor.dispose()
  }

  // --- LayerSource ----------------------------------------------------------

  getStack(textureSetId: string): LayerStack | null {
    return this.store.getState().stacks[textureSetId] ?? null
  }

  getTextures(textureSetId: string): LayerTextures | null {
    return this.textures.get(textureSetId) ?? null
  }

  // --- queries --------------------------------------------------------------

  getActiveLayer(textureSetId: string): LayerData | null {
    const stack = this.getStack(textureSetId)
    return stack?.layers.find((layer) => layer.id === stack.activeLayerId) ?? null
  }

  /** Approximate GPU memory used by layer pixel data, in bytes. */
  memoryUsage(): number {
    let total = 0
    for (const textures of this.textures.values()) total += textures.bytes()
    return total
  }

  // --- structure ------------------------------------------------------------

  addLayer(textureSetId: string, kind: LayerData['kind']): string | null {
    const layer = this.createLayer(kind)
    this.mutate(textureSetId, kind === 'fill' ? 'Add fill layer' : 'Add paint layer', (stack) => {
      const layers = [...stack.layers]
      const activeIndex = layers.findIndex((l) => l.id === stack.activeLayerId)
      layers.splice(activeIndex < 0 ? layers.length : activeIndex + 1, 0, layer)
      return { layers, activeLayerId: layer.id, paintTarget: 'content' }
    })
    return layer.id
  }

  removeLayer(textureSetId: string, layerId: string): void {
    this.mutate(textureSetId, 'Delete layer', (stack) => {
      const index = stack.layers.findIndex((l) => l.id === layerId)
      if (index < 0) return stack
      const layers = stack.layers.filter((l) => l.id !== layerId)
      const fallback = layers[Math.min(index, layers.length - 1)] ?? null
      const activeLayerId = stack.activeLayerId === layerId ? (fallback?.id ?? null) : stack.activeLayerId
      return { layers, activeLayerId, paintTarget: 'content' }
    })
  }

  duplicateLayer(textureSetId: string, layerId: string): void {
    const stack = this.getStack(textureSetId)
    const source = stack?.layers.find((l) => l.id === layerId)
    const textures = this.textures.get(textureSetId)
    if (!stack || !source || !textures) return

    const id = createId('layer')
    const mask = source.mask ? { id: createId('mask'), enabled: source.mask.enabled } : null
    textures.duplicate(source.id, id, source.mask && mask ? { from: source.mask.id, to: mask.id } : undefined)
    this.gpu.end()
    const copy: LayerData = { ...source, id, name: `${source.name} copy`, mask }

    this.mutate(textureSetId, 'Duplicate layer', (current) => {
      const layers = [...current.layers]
      const index = layers.findIndex((l) => l.id === layerId)
      layers.splice(index + 1, 0, copy)
      return { layers, activeLayerId: id, paintTarget: 'content' }
    })
  }

  /** Moves a layer up (+1) or down (-1) in the stack. */
  moveLayer(textureSetId: string, layerId: string, delta: number): void {
    this.mutate(textureSetId, 'Reorder layers', (stack) => {
      const from = stack.layers.findIndex((l) => l.id === layerId)
      const to = from + delta
      if (from < 0 || to < 0 || to >= stack.layers.length) return stack
      const layers = [...stack.layers]
      const [layer] = layers.splice(from, 1)
      layers.splice(to, 0, layer)
      return { ...stack, layers }
    })
  }

  selectLayer(textureSetId: string, layerId: string, target: PaintTarget = 'content'): void {
    this.mutate(
      textureSetId,
      'Select layer',
      (stack) => {
        const layer = stack.layers.find((l) => l.id === layerId)
        if (!layer) return stack
        const paintTarget: PaintTarget = target === 'mask' && layer.mask ? 'mask' : 'content'
        if (stack.activeLayerId === layerId && stack.paintTarget === paintTarget) return stack
        return { ...stack, activeLayerId: layerId, paintTarget }
      },
      { history: false, channels: [] },
    )
  }

  setChannelContext(channel: ChannelId): void {
    this.store.setState({ channelContext: channel })
  }

  // --- properties -----------------------------------------------------------

  renameLayer(textureSetId: string, layerId: string, name: string): void {
    this.updateLayer(textureSetId, layerId, 'Rename layer', (layer) => ({ ...layer, name }), { channels: [] })
  }

  setVisible(textureSetId: string, layerId: string, visible: boolean): void {
    this.updateLayer(textureSetId, layerId, visible ? 'Show layer' : 'Hide layer', (layer) => ({
      ...layer,
      visible,
    }))
  }

  setChannelSettings(
    textureSetId: string,
    layerId: string,
    channel: ChannelId,
    patch: Partial<LayerChannelSettings>,
    commit = true,
  ): void {
    this.updateLayer(
      textureSetId,
      layerId,
      'Change layer blending',
      (layer) => ({
        ...layer,
        channels: { ...layer.channels, [channel]: { ...layer.channels[channel], ...patch } },
      }),
      { channels: [channel], commit },
    )
  }

  setFillChannel(
    textureSetId: string,
    layerId: string,
    channel: ChannelId,
    patch: Partial<FillChannel>,
    commit = true,
  ): void {
    this.updateLayer(
      textureSetId,
      layerId,
      'Change fill',
      (layer) =>
        layer.fill
          ? { ...layer, fill: { ...layer.fill, [channel]: { ...layer.fill[channel], ...patch } } }
          : layer,
      { channels: [channel], commit },
    )
  }

  /** Applies several fill channels at once (e.g. a material preset). */
  setFillValues(textureSetId: string, layerId: string, values: Partial<Record<ChannelId, RGB>>): void {
    this.updateLayer(textureSetId, layerId, 'Apply material to fill', (layer) => {
      if (!layer.fill) return layer
      const fill = { ...layer.fill }
      for (const id of CHANNEL_IDS) {
        const value = values[id]
        if (value) fill[id] = { enabled: true, value }
      }
      return { ...layer, fill }
    })
  }

  /** Ends a continuous edit started with `commit = false`, recording one undo step. */
  commitEdit(): void {
    const pending = this.pendingEdit
    if (!pending) return
    this.pendingEdit = null
    const after = this.getStack(pending.textureSetId)
    if (!after || after === pending.before) return
    this.pushStackCommand(pending.label, pending.textureSetId, pending.before, after)
  }

  // --- masks ----------------------------------------------------------------

  /** Adds a mask that reveals (`white`) or hides (`black`) the whole layer. */
  addMask(textureSetId: string, layerId: string, fill: 'white' | 'black'): void {
    const textures = this.textures.get(textureSetId)
    if (!textures) return
    const maskId = createId('mask')
    textures.createMask(maskId, fill === 'white' ? 1 : 0)
    this.gpu.end()
    this.mutate(textureSetId, 'Add mask', (stack) => ({
      layers: stack.layers.map((l) => (l.id === layerId ? { ...l, mask: { id: maskId, enabled: true } } : l)),
      activeLayerId: layerId,
      paintTarget: 'mask',
    }))
  }

  removeMask(textureSetId: string, layerId: string): void {
    this.mutate(textureSetId, 'Remove mask', (stack) => ({
      ...stack,
      layers: stack.layers.map((l) => (l.id === layerId ? { ...l, mask: null } : l)),
      paintTarget: 'content',
    }))
  }

  setMaskEnabled(textureSetId: string, layerId: string, enabled: boolean): void {
    this.updateLayer(textureSetId, layerId, enabled ? 'Enable mask' : 'Disable mask', (layer) =>
      layer.mask ? { ...layer, mask: { ...layer.mask, enabled } } : layer,
    )
  }

  invertMask(textureSetId: string, layerId: string): void {
    const set = this.project.find(textureSetId)
    const layer = this.getStack(textureSetId)?.layers.find((l) => l.id === layerId)
    const target = layer?.mask ? this.textures.get(textureSetId)?.mask(layer.mask.id) : null
    if (!set || !layer?.mask || !target) return

    const rect = fullRect(set.resolution)
    const patch = capturePatch(this.gpu, target, rect)
    this.invertMaterial.uniforms.tSource.value = patch.saved.texture
    this.gpu.pass(this.invertMaterial, target)
    this.gpu.end()
    this.pushPatchCommand('Invert mask', set, [patch], layerId, layer.mask.id, CHANNEL_IDS, rect)
    this.compositor.invalidate(set)
    this.viewport.requestRender()
  }

  // --- strokes --------------------------------------------------------------

  /** Decides what a brush would paint on, or explains why it can't. */
  resolvePaintTarget(textureSetId: string): PaintTargetResolution {
    const stack = this.getStack(textureSetId)
    const layer = stack?.layers.find((l) => l.id === stack.activeLayerId)
    if (!stack || !layer) return { ok: false, reason: 'Select a layer to paint on.' }
    if (!layer.visible) return { ok: false, reason: 'The active layer is hidden.' }
    if (stack.paintTarget === 'mask' && layer.mask) return { ok: true, layer, target: 'mask' }
    if (layer.kind === 'fill') {
      return {
        ok: false,
        reason: 'Fill layers have no pixels to paint. Add a mask to it, or pick a paint layer.',
      }
    }
    return { ok: true, layer, target: 'content' }
  }

  /** Starts previewing a stroke. Allocates layer textures for the channels it paints. */
  beginStroke(descriptor: StrokeDescriptor): void {
    const textures = this.textures.get(descriptor.textureSet.id)
    if (!textures) return
    let channels: ChannelId[]
    if (descriptor.target === 'mask') {
      // A mask scales the layer's contribution to every channel.
      channels = [...CHANNEL_IDS]
    } else {
      channels = Object.keys(descriptor.channels) as ChannelId[]
      if (descriptor.mode === 'erase') {
        // Erasing only makes sense where something was painted.
        channels = channels.filter((id) => textures.channel(descriptor.layerId, id) !== null)
        const existing: StrokeDescriptor['channels'] = {}
        for (const id of channels) existing[id] = descriptor.channels[id]
        descriptor = { ...descriptor, channels: existing }
      } else {
        for (const id of channels) textures.ensureChannel(descriptor.layerId, id)
      }
    }
    this.stroke = { descriptor, channels }
    this.compositor.setStroke(descriptor)
  }

  /** Call after new dabs were rendered into the stroke buffer. */
  strokeChanged(rect: PxRect): void {
    if (!this.stroke) return
    this.compositor.invalidate(this.stroke.descriptor.textureSet, this.stroke.channels, rect)
  }

  /** Bakes the stroke into the layer (if it touched anything) and records an undo step. */
  endStroke(rect: PxRect | null): void {
    const stroke = this.stroke
    if (!stroke) return
    this.stroke = null
    const { descriptor, channels } = stroke
    const set = descriptor.textureSet
    const textures = this.textures.get(set.id)

    if (rect && rect.w > 0 && rect.h > 0 && textures) {
      const patches: TexturePatch[] = []
      let maskId: string | null = null

      if (descriptor.target === 'mask') {
        const layer = this.getStack(set.id)?.layers.find((l) => l.id === descriptor.layerId)
        const target = layer?.mask ? textures.mask(layer.mask.id) : null
        if (layer?.mask && target) {
          maskId = layer.mask.id
          const patch = capturePatch(this.gpu, target, rect)
          const material = this.getBakeMaterial('mask')
          this.setStrokeUniforms(material, descriptor, patch, null, false)
          this.gpu.pass(material, target, rect)
          patches.push(patch)
        }
      } else {
        for (const id of channels) {
          const target = textures.channel(descriptor.layerId, id)
          const value = descriptor.channels[id]
          if (!target || !value) continue
          const channel = getChannel(id)
          const patch = capturePatch(this.gpu, target, rect)
          const material = this.getBakeMaterial(channel.kind === 'scalar' ? 'scalar' : 'color')
          this.setStrokeUniforms(material, descriptor, patch, value, channel.kind === 'color')
          this.gpu.pass(material, target, rect)
          patches.push(patch)
        }
      }
      this.gpu.end()

      if (patches.length > 0) {
        this.pushPatchCommand(
          descriptor.mode === 'erase' ? 'Erase stroke' : 'Paint stroke',
          set,
          patches,
          descriptor.layerId,
          maskId,
          channels,
          rect,
        )
      }
    }

    this.compositor.setStroke(null)
    if (rect) this.compositor.invalidate(set, channels, rect)
    this.viewport.requestRender()
  }

  // --- internals ------------------------------------------------------------

  private onTextureSetAdded(set: TextureSet): void {
    this.textures.set(set.id, new LayerTextures(this.gpu, set.resolution))
    this.layerCounter = 0
    const layer = this.createLayer('paint')
    this.setStack(set.id, { layers: [layer], activeLayerId: layer.id, paintTarget: 'content' })
    this.compositor.invalidate(set)
    this.viewport.requestRender()
  }

  private onTextureSetRemoved(set: TextureSet): void {
    if (this.stroke?.descriptor.textureSet === set) this.stroke = null
    this.compositor.forget(set)
    this.textures.get(set.id)?.dispose()
    this.textures.delete(set.id)
    this.store.setState((state) => {
      const stacks = { ...state.stacks }
      delete stacks[set.id]
      return { stacks }
    })
  }

  private createLayer(kind: LayerData['kind']): LayerData {
    this.layerCounter += 1
    return {
      id: createId('layer'),
      name: `${kind === 'fill' ? 'Fill' : 'Layer'} ${this.layerCounter}`,
      kind,
      visible: true,
      channels: mapChannels((channel) => ({
        opacity: 1,
        blend: channel.additive ? ('add' as const) : ('normal' as const),
      })),
      fill:
        kind === 'fill'
          ? mapChannels((channel) => ({
              enabled: FILL_DEFAULTS[channel.id].enabled,
              value: [...FILL_DEFAULTS[channel.id].value] as RGB,
            }))
          : null,
      mask: null,
    }
  }

  private setStack(textureSetId: string, stack: LayerStack): void {
    this.store.setState((state) => ({ stacks: { ...state.stacks, [textureSetId]: stack } }))
  }

  private updateLayer(
    textureSetId: string,
    layerId: string,
    label: string,
    recipe: (layer: LayerData) => LayerData,
    options: MutateOptions = {},
  ): void {
    this.mutate(
      textureSetId,
      label,
      (stack) => {
        let changed = false
        const layers = stack.layers.map((layer) => {
          if (layer.id !== layerId) return layer
          const next = recipe(layer)
          if (next !== layer) changed = true
          return next
        })
        return changed ? { ...stack, layers } : stack
      },
      options,
    )
  }

  /** Single entry point for stack changes: updates state, re-composites, records undo. */
  private mutate(
    textureSetId: string,
    label: string,
    recipe: (stack: LayerStack) => LayerStack,
    options: MutateOptions = {},
  ): void {
    const before = this.getStack(textureSetId)
    if (!before) return
    const after = recipe(before)
    if (after === before) return
    this.setStack(textureSetId, after)

    const set = this.project.find(textureSetId)
    if (set && options.channels?.length !== 0) {
      this.compositor.invalidate(set, options.channels)
      this.viewport.requestRender()
    }

    if (options.history === false) return
    if (options.commit === false) {
      if (!this.pendingEdit || this.pendingEdit.textureSetId !== textureSetId) {
        this.pendingEdit = { textureSetId, label, before }
      }
      return
    }
    const start = this.pendingEdit?.textureSetId === textureSetId ? this.pendingEdit.before : before
    this.pendingEdit = null
    this.pushStackCommand(label, textureSetId, start, after)
  }

  private pushStackCommand(label: string, textureSetId: string, before: LayerStack, after: LayerStack): void {
    this.ctx.history.push(
      new LayerStackCommand(label, textureSetId, before, after, (stack) => {
        if (!this.textures.has(textureSetId)) return
        this.setStack(textureSetId, stack)
        const set = this.project.find(textureSetId)
        if (set) this.compositor.invalidate(set)
        this.viewport.requestRender()
      }),
    )
  }

  private pushPatchCommand(
    label: string,
    set: TextureSet,
    patches: TexturePatch[],
    layerId: string,
    maskId: string | null,
    channels: readonly ChannelId[],
    rect: PxRect,
  ): void {
    this.ctx.history.push(
      new TexturePatchCommand({
        label,
        textureSetId: set.id,
        gpu: this.gpu,
        patches,
        layerId,
        maskId,
        onApplied: () => {
          this.compositor.invalidate(set, channels, rect)
          this.viewport.requestRender()
        },
      }),
    )
  }

  private getBakeMaterial(kind: 'color' | 'scalar' | 'mask'): RawShaderMaterial {
    let material = this.bakeMaterials.get(kind)
    if (!material) {
      const defines: Record<string, string> = {}
      if (kind === 'scalar') defines.SCALAR = ''
      if (kind === 'mask') defines.TARGET_MASK = ''
      material = createPassMaterial(
        BAKE_STROKE_FRAGMENT,
        {
          tLayer: { value: null },
          uPatchRect: { value: new Vector4() },
          tStroke: { value: null },
          uStrokeTinted: { value: 0 },
          uStrokeOpacity: { value: 1 },
          uStrokeMode: { value: 0 },
          uBrushValue: { value: new Vector3() },
          uBrushTint: { value: 0 },
          uMaskValue: { value: 1 },
        },
        { defines },
      )
      this.bakeMaterials.set(kind, material)
    }
    return material
  }

  private setStrokeUniforms(
    material: RawShaderMaterial,
    descriptor: StrokeDescriptor,
    patch: TexturePatch,
    value: RGB | null,
    tintable: boolean,
  ): void {
    const u = material.uniforms
    u.tLayer.value = patch.saved.texture
    ;(u.uPatchRect.value as Vector4).set(patch.rect.x, patch.rect.y, patch.rect.w, patch.rect.h)
    u.tStroke.value = descriptor.texture
    u.uStrokeTinted.value = descriptor.tinted ? 1 : 0
    u.uStrokeOpacity.value = descriptor.opacity
    u.uStrokeMode.value = descriptor.mode === 'erase' ? 1 : 0
    u.uMaskValue.value = descriptor.maskValue
    if (value) (u.uBrushValue.value as Vector3).fromArray(value)
    u.uBrushTint.value = descriptor.tinted && tintable ? 1 : 0
  }

  /** Frees pixel data of layers that neither the stacks nor undo history can reach. */
  private collectGarbage(): void {
    const commands = this.ctx.history.entries()
    for (const [textureSetId, textures] of this.textures) {
      const layerIds = new Set<string>()
      const maskIds = new Set<string>()
      const stack = this.getStack(textureSetId)
      for (const layer of stack?.layers ?? []) {
        layerIds.add(layer.id)
        if (layer.mask) maskIds.add(layer.mask.id)
      }
      for (const command of commands) {
        if (!isLayerReferencing(command) || command.textureSetId !== textureSetId) continue
        for (const id of command.referencedLayerIds()) layerIds.add(id)
        for (const id of command.referencedMaskIds()) maskIds.add(id)
      }
      textures.collectGarbage(layerIds, maskIds)
    }
  }
}
