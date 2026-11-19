import { Vector3, type RawShaderMaterial, type WebGLRenderTarget } from 'three'
import { createPassMaterial, type GpuContext } from '@/core/gpu/GpuContext'
import { expandRect, isFullRect, unionRect, type PxRect } from '@/core/gpu/Rect'
import { createTarget } from '@/core/gpu/targets'
import { CHANNEL_IDS, getChannel, type ChannelId } from '@/features/project/channels'
import type { TextureSet } from '@/features/project/TextureSet'
import type { LayerTextures } from './LayerTextures'
import {
  BLEND_LAYER_FRAGMENT,
  HEIGHT_TO_NORMAL_FRAGMENT,
  PACK_ORM_FRAGMENT,
  RESOLVE_FRAGMENT,
} from './shaders/glsl'
import { blendModeIndex, type LayerStack, type StrokeDescriptor } from './types'

/** What the compositor needs to know about layers; implemented by LayerService. */
export interface LayerSource {
  getStack(textureSetId: string): LayerStack | null
  getTextures(textureSetId: string): LayerTextures | null
}

interface DirtyState {
  textureSet: TextureSet
  channels: Set<ChannelId>
  /** null = whole texture. */
  rect: PxRect | null
  full: boolean
}

interface BlendVariant {
  scalar: boolean
  source: 'texture' | 'fill' | 'empty'
  mask: boolean
  stroke: 'none' | 'content' | 'mask'
}

/** Height value 1.0 corresponds to this fraction of the UV square. */
const HEIGHT_TO_UV_SCALE = 0.02

/**
 * Flattens layer stacks into the textures the viewport displays.
 *
 * Work is deferred and coalesced: callers mark a channel/rectangle dirty with
 * `invalidate`, and `flush` (once per frame) re-blends only those channels
 * inside that rectangle. While a stroke is in progress it is blended in
 * on the fly, so painting never has to write to the layer until it ends.
 */
export class Compositor {
  private readonly gpu: GpuContext
  private readonly source: LayerSource
  private readonly dirty = new Map<string, DirtyState>()
  private readonly blendMaterials = new Map<string, RawShaderMaterial>()
  private readonly resolveMaterial: RawShaderMaterial
  private readonly packMaterial: RawShaderMaterial
  private readonly normalMaterial: RawShaderMaterial
  /** Ping-pong buffers keyed by `${precision}:${size}`. */
  private readonly scratch = new Map<string, [WebGLRenderTarget, WebGLRenderTarget]>()
  private stroke: StrokeDescriptor | null = null

  constructor(gpu: GpuContext, source: LayerSource) {
    this.gpu = gpu
    this.source = source
    this.resolveMaterial = createPassMaterial(RESOLVE_FRAGMENT, {
      tSource: { value: null },
      uMode: { value: 0 },
    })
    this.packMaterial = createPassMaterial(PACK_ORM_FRAGMENT, {
      tOcclusion: { value: null },
      tRoughness: { value: null },
      tMetallic: { value: null },
    })
    this.normalMaterial = createPassMaterial(HEIGHT_TO_NORMAL_FRAGMENT, {
      tHeight: { value: null },
      uTexel: { value: [0, 0] },
      uStrength: { value: 1 },
    })
  }

  /** Marks channels of a texture set as needing a re-blend (default: all, everywhere). */
  invalidate(
    textureSet: TextureSet,
    channels: readonly ChannelId[] = CHANNEL_IDS,
    rect: PxRect | null = null,
  ): void {
    let state = this.dirty.get(textureSet.id)
    if (!state) {
      state = { textureSet, channels: new Set(), rect: null, full: false }
      this.dirty.set(textureSet.id, state)
    }
    for (const channel of channels) state.channels.add(channel)
    if (rect === null || isFullRect(rect, textureSet.resolution)) {
      state.full = true
      state.rect = null
    } else if (!state.full) {
      state.rect = unionRect(state.rect, rect)
    }
  }

  /** Sets (or clears) the stroke that should be previewed on top of its layer. */
  setStroke(stroke: StrokeDescriptor | null): void {
    this.stroke = stroke
  }

  /** Drops pending work and cached buffers for a texture set that is going away. */
  forget(textureSet: TextureSet): void {
    this.dirty.delete(textureSet.id)
    if (this.stroke?.textureSet === textureSet) this.stroke = null
  }

  /** Releases scratch buffers whose resolution is no longer used by any texture set. */
  trimScratch(resolutionsInUse: ReadonlySet<number>): void {
    for (const [key, pair] of this.scratch) {
      const size = Number(key.split(':')[1])
      if (resolutionsInUse.has(size)) continue
      pair[0].dispose()
      pair[1].dispose()
      this.scratch.delete(key)
    }
  }

  /** Re-blends everything that was invalidated. Returns true if any texture changed. */
  flush(): boolean {
    if (this.dirty.size === 0) return false
    for (const state of this.dirty.values()) {
      const { textureSet } = state
      const stack = this.source.getStack(textureSet.id)
      const textures = this.source.getTextures(textureSet.id)
      if (!stack || !textures) continue
      const region = state.full ? null : state.rect
      if (!state.full && !region) continue

      for (const channel of state.channels) {
        this.compositeChannel(textureSet, stack, textures, channel, region)
      }
      if (state.channels.has('ao') || state.channels.has('roughness') || state.channels.has('metallic')) {
        this.packOrm(textureSet, region)
      }
      if (state.channels.has('height')) {
        this.updateNormal(textureSet, region)
      }
    }
    this.dirty.clear()
    return true
  }

  dispose(): void {
    for (const material of this.blendMaterials.values()) material.dispose()
    this.blendMaterials.clear()
    for (const pair of this.scratch.values()) {
      pair[0].dispose()
      pair[1].dispose()
    }
    this.scratch.clear()
    this.resolveMaterial.dispose()
    this.packMaterial.dispose()
    this.normalMaterial.dispose()
  }

  // --- internals ----------------------------------------------------------

  private compositeChannel(
    textureSet: TextureSet,
    stack: LayerStack,
    textures: LayerTextures,
    channelId: ChannelId,
    region: PxRect | null,
  ): void {
    const gpu = this.gpu
    const channel = getChannel(channelId)
    const pair = this.getScratch(channel.precision, textureSet.resolution)
    let read = pair[0]
    let write = pair[1]

    gpu.fill(read, channel.base[0], channel.base[1], channel.base[2], 1, region)

    const stroke = this.stroke?.textureSet === textureSet ? this.stroke : null

    for (const layer of stack.layers) {
      if (!layer.visible) continue
      const settings = layer.channels[channelId]
      if (settings.opacity <= 0) continue

      const layerStroke = stroke && stroke.layerId === layer.id ? stroke : null
      const strokeValue = layerStroke?.target === 'content' ? layerStroke.channels[channelId] : undefined

      let source: BlendVariant['source']
      let layerTexture: WebGLRenderTarget | null = null
      if (layer.kind === 'fill') {
        if (!layer.fill || !layer.fill[channelId].enabled) continue
        source = 'fill'
      } else {
        layerTexture = textures.channel(layer.id, channelId)
        if (!layerTexture && strokeValue === undefined) continue
        source = layerTexture ? 'texture' : 'empty'
      }

      const maskTexture = layer.mask?.enabled ? textures.mask(layer.mask.id) : null
      const strokeOnMask = layerStroke?.target === 'mask' && maskTexture !== null
      const strokeOnContent = strokeValue !== undefined && layer.kind === 'paint'

      const material = this.getBlendMaterial({
        scalar: channel.kind === 'scalar',
        source,
        mask: maskTexture !== null,
        stroke: strokeOnContent ? 'content' : strokeOnMask ? 'mask' : 'none',
      })
      const u = material.uniforms
      u.tDst.value = read.texture
      u.tLayer.value = layerTexture?.texture ?? null
      u.tMask.value = maskTexture?.texture ?? null
      u.uOpacity.value = settings.opacity
      u.uBlend.value = blendModeIndex(settings.blend)
      if (layer.fill) (u.uFill.value as Vector3).fromArray(layer.fill[channelId].value)
      if (layerStroke && (strokeOnContent || strokeOnMask)) {
        u.tStroke.value = layerStroke.texture
        u.uStrokeTinted.value = layerStroke.tinted ? 1 : 0
        u.uStrokeOpacity.value = layerStroke.opacity
        u.uStrokeMode.value = layerStroke.mode === 'erase' ? 1 : 0
        u.uMaskValue.value = layerStroke.maskValue
        if (strokeValue) (u.uBrushValue.value as Vector3).fromArray(strokeValue)
        u.uBrushTint.value = layerStroke.tinted && channel.kind === 'color' ? 1 : 0
      }

      gpu.pass(material, write, region)
      const swap = read
      read = write
      write = swap
    }

    this.resolveMaterial.uniforms.tSource.value = read.texture
    this.resolveMaterial.uniforms.uMode.value = channel.outputFormat === 'srgba8' ? 1 : 0
    gpu.pass(this.resolveMaterial, textureSet.output(channelId), region)
  }

  private packOrm(textureSet: TextureSet, region: PxRect | null): void {
    const u = this.packMaterial.uniforms
    u.tOcclusion.value = textureSet.output('ao').texture
    u.tRoughness.value = textureSet.output('roughness').texture
    u.tMetallic.value = textureSet.output('metallic').texture
    this.gpu.pass(this.packMaterial, textureSet.orm, region)
  }

  private updateNormal(textureSet: TextureSet, region: PxRect | null): void {
    const size = textureSet.resolution
    const u = this.normalMaterial.uniforms
    u.tHeight.value = textureSet.output('height').texture
    u.uTexel.value = [1 / size, 1 / size]
    // Sobel sums 4 texel-pair differences across a 2-texel span: divide by 8 texels.
    u.uStrength.value = (textureSet.normalStrength * HEIGHT_TO_UV_SCALE * size) / 8
    // The filter reads one texel beyond the changed area.
    this.gpu.pass(this.normalMaterial, textureSet.normal, region ? expandRect(region, 1, size) : null)
  }

  private getScratch(precision: 'ldr' | 'float', size: number): [WebGLRenderTarget, WebGLRenderTarget] {
    const key = `${precision}:${size}`
    let pair = this.scratch.get(key)
    if (!pair) {
      const format = precision === 'float' ? 'r16f' : 'rgba8'
      pair = [createTarget(size, size, format), createTarget(size, size, format)]
      this.scratch.set(key, pair)
    }
    return pair
  }

  private getBlendMaterial(variant: BlendVariant): RawShaderMaterial {
    const key = `${variant.scalar ? 's' : 'c'}|${variant.source}|${variant.mask ? 'm' : '-'}|${variant.stroke}`
    let material = this.blendMaterials.get(key)
    if (!material) {
      const defines: Record<string, string> = {}
      if (variant.scalar) defines.SCALAR = ''
      if (variant.source === 'fill') defines.SOURCE_FILL = ''
      if (variant.source === 'empty') defines.SOURCE_EMPTY = ''
      if (variant.mask) defines.USE_MASK = ''
      if (variant.stroke === 'content') defines.STROKE_CONTENT = ''
      if (variant.stroke === 'mask') defines.STROKE_MASK = ''
      material = createPassMaterial(
        BLEND_LAYER_FRAGMENT,
        {
          tDst: { value: null },
          tLayer: { value: null },
          tMask: { value: null },
          tStroke: { value: null },
          uFill: { value: new Vector3() },
          uOpacity: { value: 1 },
          uBlend: { value: 0 },
          uStrokeTinted: { value: 0 },
          uStrokeOpacity: { value: 1 },
          uStrokeMode: { value: 0 },
          uBrushValue: { value: new Vector3() },
          uBrushTint: { value: 0 },
          uMaskValue: { value: 1 },
        },
        { defines },
      )
      this.blendMaterials.set(key, material)
    }
    return material
  }
}
