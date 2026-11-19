import type { WebGLRenderTarget } from 'three'
import type { GpuContext } from '@/core/gpu/GpuContext'
import { createTarget, targetBytes, targetFormat } from '@/core/gpu/targets'
import { getChannel, type ChannelId } from '@/features/project/channels'

/**
 * GPU storage for one texture set's layers: a (value, alpha) texture per
 * layer per painted channel, plus mask textures. Everything is allocated
 * lazily, so a layer only costs memory for the channels actually painted.
 */
export class LayerTextures {
  private readonly gpu: GpuContext
  private resolution: number
  /** layer id -> channel -> texture */
  private readonly content = new Map<string, Map<ChannelId, WebGLRenderTarget>>()
  /** mask id -> texture */
  private readonly masks = new Map<string, WebGLRenderTarget>()

  constructor(gpu: GpuContext, resolution: number) {
    this.gpu = gpu
    this.resolution = resolution
  }

  channel(layerId: string, channel: ChannelId): WebGLRenderTarget | null {
    return this.content.get(layerId)?.get(channel) ?? null
  }

  /** Returns the layer's texture for a channel, creating a transparent one if needed. */
  ensureChannel(layerId: string, channel: ChannelId): WebGLRenderTarget {
    let channels = this.content.get(layerId)
    if (!channels) {
      channels = new Map()
      this.content.set(layerId, channels)
    }
    let target = channels.get(channel)
    if (!target) {
      target = this.create(getChannel(channel).layerFormat)
      this.gpu.fill(target, 0, 0, 0, 0)
      channels.set(channel, target)
    }
    return target
  }

  mask(maskId: string): WebGLRenderTarget | null {
    return this.masks.get(maskId) ?? null
  }

  createMask(maskId: string, value: number): WebGLRenderTarget {
    const target = this.create('r8')
    this.gpu.fill(target, value, 0, 0, 1)
    this.masks.set(maskId, target)
    return target
  }

  /** Copies all pixel data of one layer (and optionally a mask) to new ids. */
  duplicate(fromLayerId: string, toLayerId: string, maskIds?: { from: string; to: string }): void {
    const source = this.content.get(fromLayerId)
    if (source) {
      const copy = new Map<ChannelId, WebGLRenderTarget>()
      for (const [channel, target] of source) {
        const clone = this.create(targetFormat(target))
        this.gpu.copy(target.texture, clone)
        copy.set(channel, clone)
      }
      this.content.set(toLayerId, copy)
    }
    if (maskIds) {
      const mask = this.masks.get(maskIds.from)
      if (mask) {
        const clone = this.create('r8')
        this.gpu.copy(mask.texture, clone)
        this.masks.set(maskIds.to, clone)
      }
    }
  }

  /** Resamples every texture to a new resolution. */
  resize(resolution: number): void {
    if (resolution === this.resolution) return
    this.resolution = resolution
    const resample = (old: WebGLRenderTarget): WebGLRenderTarget => {
      const next = this.create(targetFormat(old))
      this.gpu.copy(old.texture, next)
      old.dispose()
      return next
    }
    for (const channels of this.content.values()) {
      for (const [channel, target] of channels) channels.set(channel, resample(target))
    }
    for (const [id, target] of this.masks) this.masks.set(id, resample(target))
  }

  /** Frees pixel data that is no longer referenced by the stack or by undo history. */
  collectGarbage(liveLayerIds: ReadonlySet<string>, liveMaskIds: ReadonlySet<string>): void {
    for (const [layerId, channels] of this.content) {
      if (liveLayerIds.has(layerId)) continue
      for (const target of channels.values()) target.dispose()
      this.content.delete(layerId)
    }
    for (const [maskId, target] of this.masks) {
      if (liveMaskIds.has(maskId)) continue
      target.dispose()
      this.masks.delete(maskId)
    }
  }

  /** Approximate GPU memory in use. */
  bytes(): number {
    let total = 0
    for (const channels of this.content.values()) {
      for (const target of channels.values()) total += targetBytes(target)
    }
    for (const target of this.masks.values()) total += targetBytes(target)
    return total
  }

  dispose(): void {
    for (const channels of this.content.values()) {
      for (const target of channels.values()) target.dispose()
    }
    for (const target of this.masks.values()) target.dispose()
    this.content.clear()
    this.masks.clear()
  }

  private create(format: Parameters<typeof createTarget>[2]): WebGLRenderTarget {
    // Linear filtering is exact for 1:1 passes and gives smooth resampling on resize.
    return createTarget(this.resolution, this.resolution, format, { filter: 'linear' })
  }
}
