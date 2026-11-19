import { describe, expect, it } from 'vitest'
import { expandRect, fullRect, isFullRect, scaleRect, unionRect } from './Rect'

describe('Rect', () => {
  it('unions rectangles and tolerates null', () => {
    const a = { x: 10, y: 10, w: 20, h: 20 }
    const b = { x: 25, y: 5, w: 10, h: 10 }
    expect(unionRect(a, b)).toEqual({ x: 10, y: 5, w: 25, h: 25 })
    expect(unionRect(null, b)).toEqual(b)
    expect(unionRect(a, null)).toEqual(a)
    expect(unionRect(null, null)).toBeNull()
  })

  it('expands with clamping to the texture', () => {
    expect(expandRect({ x: 2, y: 100, w: 10, h: 10 }, 8, 128)).toEqual({ x: 0, y: 92, w: 20, h: 26 })
    expect(expandRect({ x: 120, y: 120, w: 8, h: 8 }, 16, 128)).toEqual({ x: 104, y: 104, w: 24, h: 24 })
  })

  it('detects full-texture rects', () => {
    expect(isFullRect(fullRect(64), 64)).toBe(true)
    expect(isFullRect({ x: 0, y: 0, w: 63, h: 64 }, 64)).toBe(false)
  })

  it('rescales outward so no touched texel is lost', () => {
    expect(scaleRect({ x: 3, y: 3, w: 5, h: 5 }, 1024, 2048)).toEqual({ x: 6, y: 6, w: 10, h: 10 })
    expect(scaleRect({ x: 3, y: 3, w: 5, h: 5 }, 1024, 512)).toEqual({ x: 1, y: 1, w: 3, h: 3 })
  })
})
