import type { Texture } from 'three'

/** A brush tip or stamp image ready for the dab shader. */
export interface BrushTip {
  /** RGBA: rgb = tint (white for plain alphas), a = coverage. Mipmapped. */
  texture: Texture
  /** Width of the image in pixels (used to choose a mip level). */
  size: number
  /** True when rgb carries color that should tint the paint. */
  tinted: boolean
}

/**
 * Resolves asset ids to brush tips. Implemented by the assets feature and
 * injected into the paint engine, so painting does not depend on where
 * tips come from (built-in, imported, generated...).
 */
export interface BrushTipProvider {
  getTip(id: string): BrushTip | null
  /** Display info for UI that shows the current tip. */
  describe(id: string): { name: string; thumbnail: string } | null
}
