import { BoxGeometry, SphereGeometry, type BufferGeometry } from 'three'
import { describe, expect, it } from 'vitest'
import { boxUnwrap, type UnwrapOutput } from './boxUnwrap'

function unwrap(geometry: BufferGeometry): UnwrapOutput {
  const index = geometry.getIndex()
  return boxUnwrap({
    positions: new Float32Array(geometry.getAttribute('position').array),
    normals: new Float32Array(geometry.getAttribute('normal').array),
    index: index ? Uint32Array.from(index.array) : null,
  })
}

function uvArea(result: UnwrapOutput): number {
  let area = 0
  for (let t = 0; t < result.index.length; t += 3) {
    const [a, b, c] = [result.index[t], result.index[t + 1], result.index[t + 2]]
    const ux = result.uvs[b * 2] - result.uvs[a * 2]
    const uy = result.uvs[b * 2 + 1] - result.uvs[a * 2 + 1]
    const vx = result.uvs[c * 2] - result.uvs[a * 2]
    const vy = result.uvs[c * 2 + 1] - result.uvs[a * 2 + 1]
    area += Math.abs(ux * vy - uy * vx) / 2
  }
  return area
}

/** Counts texels claimed by more than one triangle on a coarse raster. */
function overlapRatio(result: UnwrapOutput, size = 256): number {
  const hits = new Uint8Array(size * size)
  for (let t = 0; t < result.index.length; t += 3) {
    const p = [0, 1, 2].map((k) => {
      const v = result.index[t + k]
      return [result.uvs[v * 2] * size, result.uvs[v * 2 + 1] * size]
    })
    const minX = Math.max(0, Math.floor(Math.min(p[0][0], p[1][0], p[2][0])))
    const maxX = Math.min(size - 1, Math.ceil(Math.max(p[0][0], p[1][0], p[2][0])))
    const minY = Math.max(0, Math.floor(Math.min(p[0][1], p[1][1], p[2][1])))
    const maxY = Math.min(size - 1, Math.ceil(Math.max(p[0][1], p[1][1], p[2][1])))
    const edge = (a: number[], b: number[], x: number, y: number) => (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0])
    const orientation = Math.sign(edge(p[0], p[1], p[2][0], p[2][1])) || 1
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const cx = x + 0.5, cy = y + 0.5
        // Strictly inside, with a small inset so shared edges don't count twice.
        const inside = [0, 1, 2].every((k) => edge(p[k], p[(k + 1) % 3], cx, cy) * orientation > 0.02)
        if (inside && hits[y * size + x] < 2) hits[y * size + x]++
      }
    }
  }
  let covered = 0
  let doubled = 0
  for (const hit of hits) {
    if (hit > 0) covered++
    if (hit > 1) doubled++
  }
  return covered === 0 ? 0 : doubled / covered
}

describe('boxUnwrap', () => {
  it('turns a cube into six charts inside the unit square', () => {
    const result = unwrap(new BoxGeometry(1, 1, 1))
    expect(result.charts).toBe(6)
    expect(result.index.length).toBe(36)
    for (const value of result.uvs) {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(1)
    }
    expect(overlapRatio(result)).toBeLessThan(0.01)
    // Six equal squares in a 3x2 shelf layout fill about two thirds of the square.
    expect(uvArea(result)).toBeGreaterThan(0.5)
  })

  it('preserves relative size (uniform texel density)', () => {
    // A 2 x 1 x 1 box: the big faces must get twice the UV area of the small ones.
    const result = unwrap(new BoxGeometry(2, 1, 1))
    const areas: number[] = []
    for (let t = 0; t < result.index.length; t += 6) {
      const quad = { ...result, index: result.index.slice(t, t + 6) }
      areas.push(uvArea(quad))
    }
    const small = Math.min(...areas)
    const large = Math.max(...areas)
    expect(large / small).toBeCloseTo(2, 3)
  })

  it('unwraps a curved mesh without overlaps', () => {
    const geometry = new SphereGeometry(1, 48, 32)
    const result = unwrap(geometry)
    expect(result.charts).toBeGreaterThanOrEqual(6)
    expect(result.charts).toBeLessThan(60)
    expect(result.index.length).toBe(geometry.getIndex()!.count)
    for (const value of result.uvs) {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(1)
    }
    expect(overlapRatio(result)).toBeLessThan(0.01)
    expect(uvArea(result)).toBeGreaterThan(0.3)
  })

  it('keeps every output vertex attribute in sync', () => {
    const result = unwrap(new SphereGeometry(1, 16, 12))
    const count = result.positions.length / 3
    expect(result.normals.length).toBe(count * 3)
    expect(result.uvs.length).toBe(count * 2)
    expect(Math.max(...result.index)).toBeLessThan(count)
  })

  it('accepts non-indexed input', () => {
    const result = unwrap(new BoxGeometry(1, 1, 1).toNonIndexed())
    expect(result.charts).toBe(6)
    expect(overlapRatio(result)).toBeLessThan(0.01)
  })
})
