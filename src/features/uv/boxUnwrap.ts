/**
 * Fast automatic UV unwrap by box projection.
 *
 * Triangles are grouped by the axis their normal faces (+X, -X, +Y, ...),
 * connected groups become charts, each chart is projected flat along its
 * axis, and the charts are shelf-packed into the unit square at a uniform
 * texel density.
 *
 * It produces more seams than a conformal (LSCM) unwrap, but it is linear
 * time, never fails, and seams matter little here because brushes work in
 * world space. It is the fallback for meshes too heavy for LSCM.
 */

export interface UnwrapInput {
  positions: Float32Array
  normals: Float32Array
  index: Uint32Array | null
}

export interface UnwrapOutput {
  positions: Float32Array
  normals: Float32Array
  uvs: Float32Array
  index: Uint32Array
  charts: number
}

/** Gap kept around every chart, as a fraction of the atlas side. */
const DEFAULT_PADDING = 5 / 1024
const WELD_STEPS = 131071 // 17 bits per axis keeps keys below 2^53

export function boxUnwrap(input: UnwrapInput, padding = DEFAULT_PADDING): UnwrapOutput {
  const { positions, normals, index } = input
  const vertexCount = positions.length / 3
  const triangleCount = (index ? index.length : vertexCount) / 3
  const vertexOf = index ? (i: number) => index[i] : (i: number) => i

  // 1. Weld vertices by position so adjacency survives split normals/UVs.
  let minX = Infinity, minY = Infinity, minZ = Infinity
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
  for (let i = 0; i < vertexCount; i++) {
    const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2]
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (z < minZ) minZ = z
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
    if (z > maxZ) maxZ = z
  }
  const extent = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1e-12)
  const quantize = WELD_STEPS / extent
  const weld = new Uint32Array(vertexCount)
  const weldIds = new Map<number, number>()
  for (let i = 0; i < vertexCount; i++) {
    const qx = Math.round((positions[i * 3] - minX) * quantize)
    const qy = Math.round((positions[i * 3 + 1] - minY) * quantize)
    const qz = Math.round((positions[i * 3 + 2] - minZ) * quantize)
    const key = (qx * 131072 + qy) * 131072 + qz
    let id = weldIds.get(key)
    if (id === undefined) {
      id = weldIds.size
      weldIds.set(key, id)
    }
    weld[i] = id
  }
  const weldCount = weldIds.size

  // 2. Classify each triangle by its dominant normal axis.
  const faceNormals = new Float32Array(triangleCount * 3)
  const bucket = new Uint8Array(triangleCount)
  for (let t = 0; t < triangleCount; t++) {
    const a = vertexOf(t * 3) * 3, b = vertexOf(t * 3 + 1) * 3, c = vertexOf(t * 3 + 2) * 3
    const ex = positions[b] - positions[a], ey = positions[b + 1] - positions[a + 1], ez = positions[b + 2] - positions[a + 2]
    const fx = positions[c] - positions[a], fy = positions[c + 1] - positions[a + 1], fz = positions[c + 2] - positions[a + 2]
    let nx = ey * fz - ez * fy, ny = ez * fx - ex * fz, nz = ex * fy - ey * fx
    const length = Math.hypot(nx, ny, nz) || 1
    nx /= length
    ny /= length
    nz /= length
    faceNormals[t * 3] = nx
    faceNormals[t * 3 + 1] = ny
    faceNormals[t * 3 + 2] = nz
    bucket[t] = dominantAxis(nx, ny, nz)
  }

  // 3. Triangle adjacency through shared (welded) edges.
  const neighbors = new Int32Array(triangleCount * 3).fill(-1)
  const edgeOwner = new Map<number, number>()
  for (let t = 0; t < triangleCount; t++) {
    for (let e = 0; e < 3; e++) {
      const a = weld[vertexOf(t * 3 + e)]
      const b = weld[vertexOf(t * 3 + ((e + 1) % 3))]
      if (a === b) continue
      const key = a < b ? a * weldCount + b : b * weldCount + a
      const other = edgeOwner.get(key)
      if (other === undefined) {
        edgeOwner.set(key, t * 3 + e)
      } else if (other >= 0) {
        neighbors[t * 3 + e] = Math.floor(other / 3)
        neighbors[other] = t
        edgeOwner.set(key, -1) // Non-manifold extras stay unconnected.
      }
    }
  }

  // 3b. Remove speckles: a triangle disagreeing with all its neighbors adopts
  // their axis when its own normal tolerates that projection.
  for (let pass = 0; pass < 2; pass++) {
    for (let t = 0; t < triangleCount; t++) {
      const own = bucket[t]
      let same = 0
      let candidate = -1
      let votes = 0
      for (let e = 0; e < 3; e++) {
        const n = neighbors[t * 3 + e]
        if (n < 0) continue
        if (bucket[n] === own) same++
        else if (bucket[n] === candidate) votes++
        else if (candidate < 0) {
          candidate = bucket[n]
          votes = 1
        }
      }
      if (same === 0 && votes >= 2 && axisDot(candidate, faceNormals, t) > 0.3) bucket[t] = candidate
    }
  }

  // 4. Flood-fill connected triangles with the same axis into charts.
  const chartOf = new Int32Array(triangleCount).fill(-1)
  const chartBucket: number[] = []
  const stack: number[] = []
  for (let seed = 0; seed < triangleCount; seed++) {
    if (chartOf[seed] >= 0) continue
    const chart = chartBucket.length
    chartBucket.push(bucket[seed])
    chartOf[seed] = chart
    stack.push(seed)
    while (stack.length > 0) {
      const t = stack.pop()!
      for (let e = 0; e < 3; e++) {
        const n = neighbors[t * 3 + e]
        if (n >= 0 && chartOf[n] < 0 && bucket[n] === bucket[seed]) {
          chartOf[n] = chart
          stack.push(n)
        }
      }
    }
  }
  const chartCount = chartBucket.length

  // 5. Project each chart along its axis and measure it (world units).
  const chartMinU = new Float64Array(chartCount).fill(Infinity)
  const chartMinV = new Float64Array(chartCount).fill(Infinity)
  const chartMaxU = new Float64Array(chartCount).fill(-Infinity)
  const chartMaxV = new Float64Array(chartCount).fill(-Infinity)
  const projected = new Float64Array(triangleCount * 6)
  for (let t = 0; t < triangleCount; t++) {
    const chart = chartOf[t]
    const axis = chartBucket[chart]
    for (let k = 0; k < 3; k++) {
      const v = vertexOf(t * 3 + k) * 3
      const x = positions[v], y = positions[v + 1], z = positions[v + 2]
      let pu: number, pv: number
      // Orientations chosen so charts are not mirrored when seen from outside.
      if (axis === 0) { pu = -z; pv = y }
      else if (axis === 1) { pu = z; pv = y }
      else if (axis === 2) { pu = x; pv = -z }
      else if (axis === 3) { pu = x; pv = z }
      else if (axis === 4) { pu = x; pv = y }
      else { pu = -x; pv = y }
      projected[t * 6 + k * 2] = pu
      projected[t * 6 + k * 2 + 1] = pv
      if (pu < chartMinU[chart]) chartMinU[chart] = pu
      if (pv < chartMinV[chart]) chartMinV[chart] = pv
      if (pu > chartMaxU[chart]) chartMaxU[chart] = pu
      if (pv > chartMaxV[chart]) chartMaxV[chart] = pv
    }
  }

  // 6. Shelf-pack chart rectangles; binary-search the smallest square that fits.
  const widths = new Float64Array(chartCount)
  const heights = new Float64Array(chartCount)
  let totalArea = 0
  let largest = 0
  for (let c = 0; c < chartCount; c++) {
    widths[c] = chartMaxU[c] - chartMinU[c]
    heights[c] = chartMaxV[c] - chartMinV[c]
    totalArea += widths[c] * heights[c]
    largest = Math.max(largest, widths[c], heights[c])
  }
  const order = Array.from({ length: chartCount }, (_, i) => i).sort((a, b) => heights[b] - heights[a])
  const offsetU = new Float64Array(chartCount)
  const offsetV = new Float64Array(chartCount)

  const pack = (side: number): boolean => {
    const pad = side * padding
    let x = pad
    let y = pad
    let shelf = 0
    for (const c of order) {
      const w = widths[c] + pad * 2
      const h = heights[c] + pad * 2
      if (w > side) return false
      if (x + w > side) {
        x = pad
        y += shelf
        shelf = 0
      }
      if (y + h > side) return false
      offsetU[c] = x + pad
      offsetV[c] = y + pad
      x += w
      if (h > shelf) shelf = h
    }
    return true
  }

  let low = Math.max(Math.sqrt(totalArea), largest, 1e-9)
  let high = low
  while (!pack(high)) high *= 1.5
  for (let i = 0; i < 28 && high - low > low * 1e-4; i++) {
    const middle = (low + high) / 2
    if (pack(middle)) high = middle
    else low = middle
  }
  pack(high)
  const side = high

  // 7. Emit vertices, splitting only where a vertex is used by several charts.
  const outPositions: number[] = []
  const outNormals: number[] = []
  const outUvs: number[] = []
  const outIndex = new Uint32Array(triangleCount * 3)
  const emitted = new Map<number, number>()
  for (let t = 0; t < triangleCount; t++) {
    const chart = chartOf[t]
    for (let k = 0; k < 3; k++) {
      const v = vertexOf(t * 3 + k)
      const key = v * chartCount + chart
      let out = emitted.get(key)
      if (out === undefined) {
        out = outPositions.length / 3
        emitted.set(key, out)
        outPositions.push(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2])
        outNormals.push(normals[v * 3], normals[v * 3 + 1], normals[v * 3 + 2])
        outUvs.push(
          (projected[t * 6 + k * 2] - chartMinU[chart] + offsetU[chart]) / side,
          (projected[t * 6 + k * 2 + 1] - chartMinV[chart] + offsetV[chart]) / side,
        )
      }
      outIndex[t * 3 + k] = out
    }
  }

  return {
    positions: new Float32Array(outPositions),
    normals: new Float32Array(outNormals),
    uvs: new Float32Array(outUvs),
    index: outIndex,
    charts: chartCount,
  }
}

/** 0:+X 1:-X 2:+Y 3:-Y 4:+Z 5:-Z */
function dominantAxis(nx: number, ny: number, nz: number): number {
  const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz)
  if (ax >= ay && ax >= az) return nx >= 0 ? 0 : 1
  if (ay >= az) return ny >= 0 ? 2 : 3
  return nz >= 0 ? 4 : 5
}

function axisDot(axis: number, faceNormals: Float32Array, t: number): number {
  const component = faceNormals[t * 3 + (axis >> 1)]
  return axis % 2 === 0 ? component : -component
}
