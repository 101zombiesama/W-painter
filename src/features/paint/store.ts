import { createStore, type StoreApi } from 'zustand/vanilla'
import { clamp, type RGB } from '@/core/utils/math'
import { CHANNEL_IDS, mapChannels, type ChannelId } from '@/features/project/channels'

export type ToolId = 'paint' | 'erase' | 'stamp' | 'picker'

/** How the brush plane is oriented where it touches the model. */
export type BrushAlignment = 'surface' | 'camera'

export interface BrushSettings {
  /** Brush radius in world units (models are normalized to a unit sphere). */
  size: number
  /** Paint deposited by each dab, 0..1. Builds up within a stroke. */
  flow: number
  /** Ceiling for a whole stroke's coverage, 0..1. */
  opacity: number
  /** 0 = fully feathered edge, 1 = crisp edge. Applies to the round tip. */
  hardness: number
  /** Distance between dabs as a fraction of the brush diameter. */
  spacing: number
  /** Tip rotation in degrees. */
  angle: number
  sizeJitter: number
  angleJitter: number
  flowJitter: number
  /** Random offset of each dab, as a fraction of the brush diameter. */
  scatter: number
  /** Rotate the tip to follow the stroke direction. */
  followStroke: boolean
  pressureSize: boolean
  pressureFlow: boolean
  alignment: BrushAlignment
  /** Skip surfaces facing away from the brush. */
  backfaceCulling: boolean
  /** Lazy-mouse radius in screen pixels; 0 disables stroke stabilization. */
  smoothing: number
  /** 'round' for the analytic tip, otherwise an alpha asset id. */
  tipId: string
}

export interface PaintChannel {
  enabled: boolean
  value: RGB
}

export type SymmetryAxis = 'x' | 'y' | 'z'

export interface PaintState {
  tool: ToolId
  brush: BrushSettings
  /** Asset id of the image placed by the stamp tool. */
  stampId: string | null
  /** The "paint" loaded on the brush: one value per material channel. */
  material: Record<ChannelId, PaintChannel>
  /** Gray level used when painting a mask (1 reveals, 0 hides). */
  maskValue: number
  symmetry: { enabled: boolean; axis: SymmetryAxis }
}

export const BRUSH_SIZE_MIN = 0.002
export const BRUSH_SIZE_MAX = 1

export const DEFAULT_BRUSH: BrushSettings = {
  size: 0.08,
  flow: 1,
  opacity: 1,
  hardness: 0.7,
  spacing: 0.08,
  angle: 0,
  sizeJitter: 0,
  angleJitter: 0,
  flowJitter: 0,
  scatter: 0,
  followStroke: false,
  pressureSize: true,
  pressureFlow: false,
  alignment: 'surface',
  backfaceCulling: true,
  smoothing: 0,
  tipId: 'round',
}

export type PaintStore = StoreApi<PaintState>

export function createPaintStore(): PaintStore {
  return createStore<PaintState>(() => ({
    tool: 'paint',
    brush: { ...DEFAULT_BRUSH },
    stampId: null,
    material: mapChannels((channel) => ({
      enabled: channel.paintDefault.enabled,
      value: [...channel.paintDefault.value] as RGB,
    })),
    maskValue: 1,
    symmetry: { enabled: false, axis: 'x' },
  }))
}

/** State transitions for the paint store, kept next to its shape. */
export function createPaintActions(store: PaintStore) {
  return {
    setTool(tool: ToolId): void {
      store.setState({ tool })
    },
    setBrush(patch: Partial<BrushSettings>): void {
      store.setState((s) => ({ brush: { ...s.brush, ...patch } }))
    },
    /** Multiplies the brush size, e.g. from the [ and ] shortcuts. */
    scaleBrushSize(factor: number): void {
      store.setState((s) => ({
        brush: { ...s.brush, size: clamp(s.brush.size * factor, BRUSH_SIZE_MIN, BRUSH_SIZE_MAX) },
      }))
    },
    setStamp(stampId: string | null): void {
      store.setState({ stampId })
    },
    setChannel(channel: ChannelId, patch: Partial<PaintChannel>): void {
      store.setState((s) => ({
        material: { ...s.material, [channel]: { ...s.material[channel], ...patch } },
      }))
    },
    /** Loads a material onto the brush: listed channels are enabled and set. */
    applyMaterial(values: Partial<Record<ChannelId, RGB>>, exclusive = false): void {
      store.setState((s) => {
        const material = { ...s.material }
        for (const id of CHANNEL_IDS) {
          const value = values[id]
          if (value) material[id] = { enabled: true, value }
          else if (exclusive) material[id] = { ...material[id], enabled: false }
        }
        return { material }
      })
    },
    setMaskValue(maskValue: number): void {
      store.setState({ maskValue })
    },
    setSymmetry(patch: Partial<PaintState['symmetry']>): void {
      store.setState((s) => ({ symmetry: { ...s.symmetry, ...patch } }))
    },
  }
}

export type PaintActions = ReturnType<typeof createPaintActions>
