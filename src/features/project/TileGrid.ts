import type { BufferAttribute, BufferGeometry } from 'three'

/** Inclusive tile-index bounds returned by `TileGrid.query`. */
export interface TileBounds {
  x0: number
  y0: number
  x1: number
  y1: number
}

const MAX_SPLIT_DEPTH = 14

/**
 * A coarse UV-space grid where every tile stores the world-space bounding box
 * of the surface it contains.
 *
 * It answers "which part of the texture can this brush dab touch?" in a few
 * microseconds, so paint and compositing passes can be scissored to a small
 * rectangle instead of processing the whole texture every frame.
 */
export class TileGrid {
  readonly grid: number
  /** Average UV units per world unit (sqrt of the area ratio). */
  readonly uvPerWorldUnit: number
  /** Fraction of the UV square covered by triangles. */
  readonly uvCoverage: number
  /** Per tile: minX, minY, minZ, maxX, maxY, maxZ. Empty tiles have min > max. */
  private readonly bounds: Float32Array

  constructor(geometry: BufferGeometry, grid = 32) {
    this.grid = grid
    this.bounds = new Float32Array(grid * grid * 6)
    for (let i = 0; i < grid * grid; i++) {
      const o = i * 6
      this.bounds[o] = this.bounds[o + 1] = this.bounds[o + 2] = Infinity
      this.bounds[o + 3] = this.bounds[o + 4] = this.bounds[o + 5] = -Infinity
    }

    const position = geometry.getAttribute('position') as BufferAttribute
    const uv = geometry.getAttribute('uv') as BufferAttribute
    const index = geometry.getIndex()
    const triangleCount = (index ? index.count : position.count) / 3

    let worldArea = 0
    let uvArea = 0
    // Work stack of triangles: 3 * (x, y, z, u, v) + depth = 16 numbers each.
    const stack: number[] = []

    for (let t = 0; t < triangleCount; t++) {
      const ia = index ? index.getX(t * 3) : t * 3
      const ib = index ? index.getX(t * 3 + 1) : t * 3 + 1
      const ic = index ? index.getX(t * 3 + 2) : t * 3 + 2

      const ax = position.getX(ia), ay = position.getY(ia), az = position.getZ(ia)
      const bx = position.getX(ib), by = position.getY(ib), bz = position.getZ(ib)
      const cx = position.getX(ic), cy = position.getY(ic), cz = position.getZ(ic)
      const au = uv.getX(ia), av = uv.getY(ia)
      const bu = uv.getX(ib), bv = uv.getY(ib)
      const cu = uv.getX(ic), cv = uv.getY(ic)

      const ex = bx - ax, ey = by - ay, ez = bz - az
      const fx = cx - ax, fy = cy - ay, fz = cz - az
      const nx = ey * fz - ez * fy, ny = ez * fx - ex * fz, nz = ex * fy - ey * fx
      worldArea += Math.sqrt(nx * nx + ny * ny + nz * nz) * 0.5
      uvArea += Math.abs((bu - au) * (cv - av) - (cu - au) * (bv - av)) * 0.5

      stack.push(ax, ay, az, au, av, bx, by, bz, bu, bv, cx, cy, cz, cu, cv, 0)
      while (stack.length > 0) this.processTriangle(stack)
    }

    this.uvPerWorldUnit = worldArea > 0 && uvArea > 0 ? Math.sqrt(uvArea / worldArea) : 1
    this.uvCoverage = Math.min(1, uvArea)
  }

  /**
   * Pops one triangle. If it fits in a 2x2 tile block its bounding box is
   * merged into those tiles; otherwise it is split along its longest UV edge
   * so large triangles don't smear one huge box over every tile they span.
   */
  private processTriangle(stack: number[]): void {
    const g = this.grid
    const depth = stack.pop()!
    const cv = stack.pop()!, cu = stack.pop()!, cz = stack.pop()!, cy = stack.pop()!, cx = stack.pop()!
    const bv = stack.pop()!, bu = stack.pop()!, bz = stack.pop()!, by = stack.pop()!, bx = stack.pop()!
    const av = stack.pop()!, au = stack.pop()!, az = stack.pop()!, ay = stack.pop()!, ax = stack.pop()!

    const tx0 = tileIndex(Math.min(au, bu, cu), g)
    const tx1 = Math.max(tx0, lastTileIndex(Math.max(au, bu, cu), g))
    const ty0 = tileIndex(Math.min(av, bv, cv), g)
    const ty1 = Math.max(ty0, lastTileIndex(Math.max(av, bv, cv), g))

    if ((tx1 - tx0 <= 1 && ty1 - ty0 <= 1) || depth >= MAX_SPLIT_DEPTH) {
      const minX = Math.min(ax, bx, cx), minY = Math.min(ay, by, cy), minZ = Math.min(az, bz, cz)
      const maxX = Math.max(ax, bx, cx), maxY = Math.max(ay, by, cy), maxZ = Math.max(az, bz, cz)
      const bounds = this.bounds
      for (let ty = ty0; ty <= ty1; ty++) {
        for (let tx = tx0; tx <= tx1; tx++) {
          const o = (ty * g + tx) * 6
          if (minX < bounds[o]) bounds[o] = minX
          if (minY < bounds[o + 1]) bounds[o + 1] = minY
          if (minZ < bounds[o + 2]) bounds[o + 2] = minZ
          if (maxX > bounds[o + 3]) bounds[o + 3] = maxX
          if (maxY > bounds[o + 4]) bounds[o + 4] = maxY
          if (maxZ > bounds[o + 5]) bounds[o + 5] = maxZ
        }
      }
      return
    }

    const ab = (bu - au) ** 2 + (bv - av) ** 2
    const bc = (cu - bu) ** 2 + (cv - bv) ** 2
    const ca = (au - cu) ** 2 + (av - cv) ** 2
    const d = depth + 1
    if (ab >= bc && ab >= ca) {
      const mx = (ax + bx) / 2, my = (ay + by) / 2, mz = (az + bz) / 2, mu = (au + bu) / 2, mv = (av + bv) / 2
      stack.push(ax, ay, az, au, av, mx, my, mz, mu, mv, cx, cy, cz, cu, cv, d)
      stack.push(mx, my, mz, mu, mv, bx, by, bz, bu, bv, cx, cy, cz, cu, cv, d)
    } else if (bc >= ca) {
      const mx = (bx + cx) / 2, my = (by + cy) / 2, mz = (bz + cz) / 2, mu = (bu + cu) / 2, mv = (bv + cv) / 2
      stack.push(ax, ay, az, au, av, bx, by, bz, bu, bv, mx, my, mz, mu, mv, d)
      stack.push(ax, ay, az, au, av, mx, my, mz, mu, mv, cx, cy, cz, cu, cv, d)
    } else {
      const mx = (cx + ax) / 2, my = (cy + ay) / 2, mz = (cz + az) / 2, mu = (cu + au) / 2, mv = (cv + av) / 2
      stack.push(ax, ay, az, au, av, bx, by, bz, bu, bv, mx, my, mz, mu, mv, d)
      stack.push(mx, my, mz, mu, mv, bx, by, bz, bu, bv, cx, cy, cz, cu, cv, d)
    }
  }

  /**
   * Finds the tiles whose surface lies within any of the given spheres.
   * `spheres` is a flat array of (x, y, z, radius). Returns null if nothing is hit.
   */
  query(spheres: ArrayLike<number>, count: number): TileBounds | null {
    const g = this.grid
    const bounds = this.bounds
    let x0 = g, y0 = g, x1 = -1, y1 = -1

    for (let ty = 0; ty < g; ty++) {
      for (let tx = 0; tx < g; tx++) {
        // Tiles already inside the result rect cannot grow it.
        if (tx >= x0 && tx <= x1 && ty >= y0 && ty <= y1) continue
        const o = (ty * g + tx) * 6
        const minX = bounds[o]
        if (minX > bounds[o + 3]) continue
        for (let s = 0; s < count; s++) {
          const sx = spheres[s * 4], sy = spheres[s * 4 + 1], sz = spheres[s * 4 + 2], r = spheres[s * 4 + 3]
          const dx = sx < minX ? minX - sx : sx > bounds[o + 3] ? sx - bounds[o + 3] : 0
          const dy = sy < bounds[o + 1] ? bounds[o + 1] - sy : sy > bounds[o + 4] ? sy - bounds[o + 4] : 0
          const dz = sz < bounds[o + 2] ? bounds[o + 2] - sz : sz > bounds[o + 5] ? sz - bounds[o + 5] : 0
          if (dx * dx + dy * dy + dz * dz <= r * r) {
            if (tx < x0) x0 = tx
            if (tx > x1) x1 = tx
            if (ty < y0) y0 = ty
            if (ty > y1) y1 = ty
            break
          }
        }
      }
    }

    return x1 < 0 ? null : { x0, y0, x1, y1 }
  }
}

function tileIndex(coord: number, grid: number): number {
  const i = Math.floor(coord * grid)
  return i < 0 ? 0 : i >= grid ? grid - 1 : i
}

/**
 * Tile containing the upper end of a range. A range ending exactly on a tile
 * border does not reach into the next tile.
 */
function lastTileIndex(coord: number, grid: number): number {
  const i = Math.ceil(coord * grid) - 1
  return i < 0 ? 0 : i >= grid ? grid - 1 : i
}
