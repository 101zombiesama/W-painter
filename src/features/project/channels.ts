import type { TargetFormat } from '@/core/gpu/targets'
import type { RGB } from '@/core/utils/math'

/**
 * Material channels a texture set can hold.
 *
 * To add a channel: add its id here, describe it in CHANNELS, and bind its
 * flattened output to the viewport material in TextureSet.ts. Layers, the
 * compositor, the brush and the export pipeline pick it up from the registry.
 */
export type ChannelId = 'baseColor' | 'height' | 'roughness' | 'metallic' | 'emissive' | 'ao'

export interface ChannelDef {
  id: ChannelId
  label: string
  short: string
  kind: 'color' | 'scalar'
  /** Per-layer storage: value + coverage alpha. */
  layerFormat: TargetFormat
  /** Flattened result consumed by the viewport and by export. */
  outputFormat: TargetFormat
  /** Precision of the intermediate buffers used while flattening. */
  precision: 'ldr' | 'float'
  /** Value of an empty layer stack. Colors are sRGB-encoded. */
  base: RGB
  min: number
  max: number
  /** Initial brush state for this channel. */
  paintDefault: { enabled: boolean; value: RGB }
  /** Height accumulates across layers instead of replacing. */
  additive: boolean
}

export const CHANNELS: readonly ChannelDef[] = [
  {
    id: 'baseColor',
    label: 'Base Color',
    short: 'Color',
    kind: 'color',
    layerFormat: 'rgba8',
    outputFormat: 'srgba8',
    precision: 'ldr',
    base: [0.5, 0.5, 0.5],
    min: 0,
    max: 1,
    paintDefault: { enabled: true, value: [0.89, 0.33, 0.17] },
    additive: false,
  },
  {
    id: 'height',
    label: 'Height',
    short: 'Height',
    kind: 'scalar',
    layerFormat: 'rg16f',
    outputFormat: 'r16f',
    precision: 'float',
    base: [0, 0, 0],
    min: -1,
    max: 1,
    paintDefault: { enabled: false, value: [0.35, 0.35, 0.35] },
    additive: true,
  },
  {
    id: 'roughness',
    label: 'Roughness',
    short: 'Rough',
    kind: 'scalar',
    layerFormat: 'rg8',
    outputFormat: 'r8',
    precision: 'ldr',
    base: [0.5, 0.5, 0.5],
    min: 0,
    max: 1,
    paintDefault: { enabled: true, value: [0.35, 0.35, 0.35] },
    additive: false,
  },
  {
    id: 'metallic',
    label: 'Metallic',
    short: 'Metal',
    kind: 'scalar',
    layerFormat: 'rg8',
    outputFormat: 'r8',
    precision: 'ldr',
    base: [0, 0, 0],
    min: 0,
    max: 1,
    paintDefault: { enabled: true, value: [0, 0, 0] },
    additive: false,
  },
  {
    id: 'emissive',
    label: 'Emissive',
    short: 'Emissive',
    kind: 'color',
    layerFormat: 'rgba8',
    outputFormat: 'srgba8',
    precision: 'ldr',
    base: [0, 0, 0],
    min: 0,
    max: 1,
    paintDefault: { enabled: false, value: [1, 0.55, 0.15] },
    additive: false,
  },
  {
    id: 'ao',
    label: 'Ambient Occlusion',
    short: 'AO',
    kind: 'scalar',
    layerFormat: 'rg8',
    outputFormat: 'r8',
    precision: 'ldr',
    base: [1, 1, 1],
    min: 0,
    max: 1,
    paintDefault: { enabled: false, value: [0.4, 0.4, 0.4] },
    additive: false,
  },
]

export const CHANNEL_IDS: readonly ChannelId[] = CHANNELS.map((c) => c.id)

const BY_ID = new Map(CHANNELS.map((c) => [c.id, c]))

export function getChannel(id: ChannelId): ChannelDef {
  return BY_ID.get(id)!
}

/** Builds a per-channel record, e.g. for stores keyed by channel. */
export function mapChannels<T>(fn: (channel: ChannelDef) => T): Record<ChannelId, T> {
  const out = {} as Record<ChannelId, T>
  for (const channel of CHANNELS) out[channel.id] = fn(channel)
  return out
}
