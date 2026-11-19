import type { WebGLRenderTarget } from 'three'
import type { GpuContext } from '@/core/gpu/GpuContext'
import type { PxRect } from '@/core/gpu/Rect'
import { createTarget, targetBytes, targetFormat } from '@/core/gpu/targets'
import type { Command } from '@/core/history/History'
import type { LayerStack } from './types'

/** Commands that keep layer pixel data alive implement this for garbage collection. */
export interface LayerReferencing {
  readonly textureSetId: string
  referencedLayerIds(): Iterable<string>
  referencedMaskIds(): Iterable<string>
}

export function isLayerReferencing(command: object): command is LayerReferencing {
  return 'referencedLayerIds' in command && 'referencedMaskIds' in command
}

function collectIds(stack: LayerStack, layerIds: Set<string>, maskIds: Set<string>): void {
  for (const layer of stack.layers) {
    layerIds.add(layer.id)
    if (layer.mask) maskIds.add(layer.mask.id)
  }
}

/**
 * Undo step for structural or property changes to a layer stack (Memento).
 * Layer state is immutable, so a snapshot is just a reference to the old tree.
 */
export class LayerStackCommand implements Command, LayerReferencing {
  readonly label: string
  readonly textureSetId: string
  private readonly before: LayerStack
  private readonly after: LayerStack
  private readonly apply: (stack: LayerStack) => void

  constructor(
    label: string,
    textureSetId: string,
    before: LayerStack,
    after: LayerStack,
    apply: (stack: LayerStack) => void,
  ) {
    this.label = label
    this.textureSetId = textureSetId
    this.before = before
    this.after = after
    this.apply = apply
  }

  undo(): void {
    this.apply(this.before)
  }

  redo(): void {
    this.apply(this.after)
  }

  referencedLayerIds(): Iterable<string> {
    const layers = new Set<string>()
    collectIds(this.before, layers, new Set())
    collectIds(this.after, layers, new Set())
    return layers
  }

  referencedMaskIds(): Iterable<string> {
    const masks = new Set<string>()
    collectIds(this.before, new Set(), masks)
    collectIds(this.after, new Set(), masks)
    return masks
  }
}

/** A saved rectangle of one texture. */
export interface TexturePatch {
  target: WebGLRenderTarget
  rect: PxRect
  /** Rect-sized copy of the pixels to swap back in. */
  saved: WebGLRenderTarget
}

/** Copies a rectangle of `target` into a new rect-sized texture. */
export function capturePatch(gpu: GpuContext, target: WebGLRenderTarget, rect: PxRect): TexturePatch {
  const saved = createTarget(rect.w, rect.h, targetFormat(target), { filter: 'nearest' })
  gpu.copyRect(target.texture, target.width, target.height, rect, saved, { x: 0, y: 0, w: rect.w, h: rect.h })
  return { target, rect, saved }
}

/**
 * Undo step for pixel edits (brush strokes, mask operations). Stores only the
 * affected rectangle of each texture; undo and redo swap it with the live pixels.
 */
export class TexturePatchCommand implements Command, LayerReferencing {
  readonly label: string
  readonly textureSetId: string
  readonly bytes: number
  private readonly gpu: GpuContext
  private readonly patches: TexturePatch[]
  private readonly layerId: string
  private readonly maskId: string | null
  private readonly onApplied: () => void

  constructor(options: {
    label: string
    textureSetId: string
    gpu: GpuContext
    patches: TexturePatch[]
    layerId: string
    maskId: string | null
    /** Called after undo/redo so the owner can re-composite. */
    onApplied: () => void
  }) {
    this.label = options.label
    this.textureSetId = options.textureSetId
    this.gpu = options.gpu
    this.patches = options.patches
    this.layerId = options.layerId
    this.maskId = options.maskId
    this.onApplied = options.onApplied
    this.bytes = this.patches.reduce((sum, patch) => sum + targetBytes(patch.saved), 0)
  }

  undo(): void {
    this.swap()
  }

  redo(): void {
    this.swap()
  }

  dispose(): void {
    for (const patch of this.patches) patch.saved.dispose()
  }

  referencedLayerIds(): Iterable<string> {
    return [this.layerId]
  }

  referencedMaskIds(): Iterable<string> {
    return this.maskId ? [this.maskId] : []
  }

  private swap(): void {
    for (const patch of this.patches) {
      const current = capturePatch(this.gpu, patch.target, patch.rect)
      this.gpu.copyRect(
        patch.saved.texture,
        patch.rect.w,
        patch.rect.h,
        { x: 0, y: 0, w: patch.rect.w, h: patch.rect.h },
        patch.target,
        patch.rect,
      )
      patch.saved.dispose()
      patch.saved = current.saved
    }
    this.gpu.end()
    this.onApplied()
  }
}
