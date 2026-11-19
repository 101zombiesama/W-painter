import type { Texture } from 'three'
import type { RGB } from '@/core/utils/math'
import type { ChannelId } from '@/features/project/channels'
import type { TextureSet } from '@/features/project/TextureSet'

export type BlendModeId =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'add'
  | 'subtract'
  | 'darken'
  | 'lighten'

/** Order matters: the index is the `uBlend` value used by the blend shader. */
export const BLEND_MODES: readonly { id: BlendModeId; label: string }[] = [
  { id: 'normal', label: 'Normal' },
  { id: 'multiply', label: 'Multiply' },
  { id: 'screen', label: 'Screen' },
  { id: 'overlay', label: 'Overlay' },
  { id: 'add', label: 'Add' },
  { id: 'subtract', label: 'Subtract' },
  { id: 'darken', label: 'Darken' },
  { id: 'lighten', label: 'Lighten' },
]

export function blendModeIndex(id: BlendModeId): number {
  return BLEND_MODES.findIndex((mode) => mode.id === id)
}

export interface LayerChannelSettings {
  opacity: number
  blend: BlendModeId
}

export interface FillChannel {
  enabled: boolean
  value: RGB
}

export interface LayerMask {
  /** Identifies the mask texture; a re-created mask gets a new id. */
  id: string
  enabled: boolean
}

/** Serializable description of a layer. Pixel data lives in LayerTextures. */
export interface LayerData {
  id: string
  name: string
  /** `paint` layers hold painted texels; `fill` layers hold uniform values. */
  kind: 'paint' | 'fill'
  visible: boolean
  channels: Record<ChannelId, LayerChannelSettings>
  fill: Record<ChannelId, FillChannel> | null
  mask: LayerMask | null
}

export type PaintTarget = 'content' | 'mask'

export interface LayerStack {
  /** Bottom-most layer first. */
  layers: LayerData[]
  activeLayerId: string | null
  /** Whether brushes edit the active layer's pixels or its mask. */
  paintTarget: PaintTarget
}

export interface LayersState {
  /** Layer stacks keyed by texture set id. */
  stacks: Record<string, LayerStack>
  /** Channel whose blend/opacity the layer list is showing. */
  channelContext: ChannelId
}

/**
 * A brush stroke in progress. The paint engine accumulates coverage into
 * `texture`; the layers feature previews it live and bakes it on commit.
 */
export interface StrokeDescriptor {
  textureSet: TextureSet
  layerId: string
  target: PaintTarget
  /** Coverage buffer at the texture set's resolution. */
  texture: Texture
  /** True: RGBA = premultiplied tint + coverage. False: R = coverage. */
  tinted: boolean
  mode: 'paint' | 'erase'
  /** Upper bound on the stroke's coverage ("stroke opacity"). */
  opacity: number
  /** Value painted into each enabled channel (content target only). */
  channels: Partial<Record<ChannelId, RGB>>
  /** Gray value painted when the target is a mask. */
  maskValue: number
}
