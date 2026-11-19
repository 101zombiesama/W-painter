import { BufferAttribute, BufferGeometry, PlaneGeometry, SphereGeometry } from 'three'
import { describe, expect, it } from 'vitest'
import { TileGrid } from './TileGrid'

describe('TileGrid', () => {
  it('maps a brush sphere to the tiles under it', () => {
    // A 2x2 plane in the XY plane: uv (0,0) is at (-1,-1), uv (1,1) at (1,1).
    const grid = new TileGrid(new PlaneGeometry(2, 2, 16, 16), 8)

    // Near the bottom-left corner of the plane.
    const corner = grid.query([-0.9, -0.9, 0, 0.05], 1)
    expect(corner).toEqual({ x0: 0, y0: 0, x1: 0, y1: 0 })

    // Center, radius reaching about one tile (0.25 world units) each way.
    const center = grid.query([0, 0, 0, 0.2], 1)
    expect(center).toEqual({ x0: 3, y0: 3, x1: 4, y1: 4 })
  })

  it('returns null when the brush touches nothing', () => {
    const grid = new TileGrid(new PlaneGeometry(2, 2, 4, 4), 8)
    expect(grid.query([0, 0, 5, 0.5], 1)).toBeNull()
  })

  it('unions the tiles of several dabs', () => {
    const grid = new TileGrid(new PlaneGeometry(2, 2, 16, 16), 8)
    const bounds = grid.query([-0.9, -0.9, 0, 0.05, 0.9, 0.9, 0, 0.05], 2)
    expect(bounds).toEqual({ x0: 0, y0: 0, x1: 7, y1: 7 })
  })

  it('keeps culling tight for triangles much larger than a tile', () => {
    // One quad made of two huge triangles covering the whole UV square.
    const grid = new TileGrid(new PlaneGeometry(2, 2, 1, 1), 16)
    const bounds = grid.query([0.95, 0.95, 0, 0.02], 1)
    expect(bounds).not.toBeNull()
    // Without subdivision every tile would report the whole plane.
    expect(bounds!.x0).toBeGreaterThanOrEqual(14)
    expect(bounds!.y0).toBeGreaterThanOrEqual(14)
  })

  it('reports texel density and coverage', () => {
    const plane = new TileGrid(new PlaneGeometry(2, 2, 2, 2))
    expect(plane.uvPerWorldUnit).toBeCloseTo(0.5, 5) // 1 UV unit spans 2 world units
    expect(plane.uvCoverage).toBeCloseTo(1, 5)

    const sphere = new TileGrid(new SphereGeometry(1, 32, 16))
    expect(sphere.uvCoverage).toBeGreaterThan(0.9)
    expect(sphere.uvPerWorldUnit).toBeGreaterThan(0.2)
  })

  it('never misses the surface under a dab (conservative culling)', () => {
    const geometry = new SphereGeometry(1, 48, 24)
    const grid = new TileGrid(geometry, 32)
    const position = geometry.getAttribute('position')
    const uv = geometry.getAttribute('uv')
    for (let i = 0; i < position.count; i += 37) {
      const bounds = grid.query([position.getX(i), position.getY(i), position.getZ(i), 0.01], 1)
      expect(bounds).not.toBeNull()
      const tx = Math.min(31, Math.floor(uv.getX(i) * 32))
      const ty = Math.min(31, Math.floor(uv.getY(i) * 32))
      // The vertex's own tile (or its neighbour, for vertices exactly on a border) must be included.
      expect(tx).toBeGreaterThanOrEqual(bounds!.x0 - 1)
      expect(tx).toBeLessThanOrEqual(bounds!.x1 + 1)
      expect(ty).toBeGreaterThanOrEqual(bounds!.y0 - 1)
      expect(ty).toBeLessThanOrEqual(bounds!.y1 + 1)
    }
  })

  it('handles non-indexed geometry', () => {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3))
    geometry.setAttribute('uv', new BufferAttribute(new Float32Array([0, 0, 0.1, 0, 0, 0.1]), 2))
    const grid = new TileGrid(geometry, 8)
    expect(grid.query([0.2, 0.2, 0, 0.05], 1)).toEqual({ x0: 0, y0: 0, x1: 0, y1: 0 })
  })
})
