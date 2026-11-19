/** Integer pixel rectangle. Origin is the bottom-left texel, like GL scissor boxes. */
export interface PxRect {
  x: number
  y: number
  w: number
  h: number
}

export function fullRect(size: number): PxRect {
  return { x: 0, y: 0, w: size, h: size }
}

export function isFullRect(rect: PxRect, size: number): boolean {
  return rect.x <= 0 && rect.y <= 0 && rect.w >= size && rect.h >= size
}

export function unionRect(a: PxRect | null, b: PxRect | null): PxRect | null {
  if (!a) return b ? { ...b } : null
  if (!b) return { ...a }
  const x0 = Math.min(a.x, b.x)
  const y0 = Math.min(a.y, b.y)
  const x1 = Math.max(a.x + a.w, b.x + b.w)
  const y1 = Math.max(a.y + a.h, b.y + b.h)
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

/** Grows a rect by `margin` texels on every side, clamped to a square texture. */
export function expandRect(rect: PxRect, margin: number, size: number): PxRect {
  const x0 = Math.max(0, rect.x - margin)
  const y0 = Math.max(0, rect.y - margin)
  const x1 = Math.min(size, rect.x + rect.w + margin)
  const y1 = Math.min(size, rect.y + rect.h + margin)
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) }
}

/** Converts a rect between texture resolutions, rounding outward. */
export function scaleRect(rect: PxRect, fromSize: number, toSize: number): PxRect {
  if (fromSize === toSize) return { ...rect }
  const k = toSize / fromSize
  const x0 = Math.floor(rect.x * k)
  const y0 = Math.floor(rect.y * k)
  const x1 = Math.min(toSize, Math.ceil((rect.x + rect.w) * k))
  const y1 = Math.min(toSize, Math.ceil((rect.y + rect.h) * k))
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}
