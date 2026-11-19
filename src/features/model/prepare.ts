import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  Matrix3,
  Vector3,
  type Material,
  type Mesh,
  type Object3D,
} from 'three'

/** One material slot of an imported model, flattened to world space. */
export interface RawPart {
  name: string
  /** Indexed geometry with position and normal, and uv when the source had it. */
  geometry: BufferGeometry
}

const _v = new Vector3()

/**
 * Collects every mesh under `root`, bakes transforms into the vertices and
 * groups triangles by material. Each group later becomes one texture set.
 */
export function extractParts(root: Object3D): RawPart[] {
  root.updateWorldMatrix(true, true)
  const buckets = new Map<string, { name: string; geometries: BufferGeometry[] }>()

  const addToBucket = (material: Material | undefined, fallbackName: string, geometry: BufferGeometry) => {
    const key = material?.uuid ?? 'default'
    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = { name: material?.name || fallbackName || `Material ${buckets.size + 1}`, geometries: [] }
      buckets.set(key, bucket)
    }
    bucket.geometries.push(geometry)
  }

  root.traverse((object) => {
    const mesh = object as Mesh
    if (!mesh.isMesh || !mesh.geometry?.getAttribute('position')) return
    const world = bakeGeometry(mesh)
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const groups = mesh.geometry.groups
    if (materials.length > 1 && groups.length > 0) {
      for (const group of groups) {
        const part = sliceGeometry(world, group.start, group.count)
        if (part) addToBucket(materials[group.materialIndex ?? 0], mesh.name, part)
      }
    } else {
      addToBucket(materials[0], mesh.name, world)
    }
  })

  const parts: RawPart[] = []
  for (const bucket of buckets.values()) {
    const geometry = mergeGeometries(bucket.geometries)
    if (geometry) parts.push({ name: bucket.name, geometry })
  }
  return parts
}

/**
 * Centers the model on the origin and scales it to fit a unit sphere, so
 * brush sizes and camera clipping behave the same for any asset.
 */
export function normalizeParts(parts: RawPart[]): void {
  const box = new Box3()
  for (const part of parts) {
    part.geometry.computeBoundingBox()
    box.union(part.geometry.boundingBox!)
  }
  if (box.isEmpty()) return
  const center = box.getCenter(new Vector3())
  const radius = box.getSize(new Vector3()).length() / 2 || 1
  const scale = 1 / radius
  for (const part of parts) {
    const position = part.geometry.getAttribute('position') as BufferAttribute
    const array = position.array as Float32Array
    for (let i = 0; i < array.length; i += 3) {
      array[i] = (array[i] - center.x) * scale
      array[i + 1] = (array[i + 1] - center.y) * scale
      array[i + 2] = (array[i + 2] - center.z) * scale
    }
    position.needsUpdate = true
    part.geometry.computeBoundingBox()
    part.geometry.computeBoundingSphere()
  }
}

/** Copies a mesh into a clean world-space geometry (position, normal, uv, index). */
function bakeGeometry(mesh: Mesh): BufferGeometry {
  const source = mesh.geometry
  const sourcePosition = source.getAttribute('position')
  const sourceNormal = source.getAttribute('normal')
  const sourceUv = source.getAttribute('uv')
  const count = sourcePosition.count
  const matrix = mesh.matrixWorld
  const normalMatrix = new Matrix3().getNormalMatrix(matrix)

  const positions = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    // getVertexPosition also applies morph targets and skinning (bind pose).
    mesh.getVertexPosition(i, _v).applyMatrix4(matrix)
    positions[i * 3] = _v.x
    positions[i * 3 + 1] = _v.y
    positions[i * 3 + 2] = _v.z
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))

  if (sourceUv) {
    const uvs = new Float32Array(count * 2)
    for (let i = 0; i < count; i++) {
      uvs[i * 2] = sourceUv.getX(i)
      uvs[i * 2 + 1] = sourceUv.getY(i)
    }
    geometry.setAttribute('uv', new BufferAttribute(uvs, 2))
  }

  const sourceIndex = source.getIndex()
  const index = new Uint32Array(sourceIndex ? sourceIndex.count : count)
  for (let i = 0; i < index.length; i++) index[i] = sourceIndex ? sourceIndex.getX(i) : i
  if (matrix.determinant() < 0) {
    // Mirrored transforms flip triangle winding; restore it.
    for (let i = 0; i + 2 < index.length; i += 3) {
      const swap = index[i + 1]
      index[i + 1] = index[i + 2]
      index[i + 2] = swap
    }
  }
  geometry.setIndex(new BufferAttribute(index, 1))

  if (sourceNormal) {
    const normals = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      _v.fromBufferAttribute(sourceNormal, i).applyMatrix3(normalMatrix).normalize()
      normals[i * 3] = _v.x
      normals[i * 3 + 1] = _v.y
      normals[i * 3 + 2] = _v.z
    }
    geometry.setAttribute('normal', new BufferAttribute(normals, 3))
  } else {
    geometry.computeVertexNormals()
  }
  return geometry
}

/** Extracts an index range into its own compact geometry (unused vertices dropped). */
function sliceGeometry(geometry: BufferGeometry, start: number, count: number): BufferGeometry | null {
  const index = geometry.getIndex()!.array as Uint32Array
  const end = Math.min(index.length, start + count)
  if (end <= start) return null
  const remap = new Map<number, number>()
  const newIndex = new Uint32Array(end - start)
  for (let i = start; i < end; i++) {
    let mapped = remap.get(index[i])
    if (mapped === undefined) {
      mapped = remap.size
      remap.set(index[i], mapped)
    }
    newIndex[i - start] = mapped
  }

  const result = new BufferGeometry()
  for (const name of ['position', 'normal', 'uv'] as const) {
    const attribute = geometry.getAttribute(name) as BufferAttribute | undefined
    if (!attribute) continue
    const size = attribute.itemSize
    const source = attribute.array as Float32Array
    const array = new Float32Array(remap.size * size)
    for (const [from, to] of remap) {
      for (let k = 0; k < size; k++) array[to * size + k] = source[from * size + k]
    }
    result.setAttribute(name, new BufferAttribute(array, size))
  }
  result.setIndex(new BufferAttribute(newIndex, 1))
  return result
}

/** Concatenates geometries. UVs are kept only if every piece has them. */
function mergeGeometries(geometries: BufferGeometry[]): BufferGeometry | null {
  if (geometries.length === 0) return null
  if (geometries.length === 1) return geometries[0]

  const keepUv = geometries.every((g) => g.getAttribute('uv') !== undefined)
  let vertexCount = 0
  let indexCount = 0
  for (const g of geometries) {
    vertexCount += g.getAttribute('position').count
    indexCount += g.getIndex()!.count
  }

  const positions = new Float32Array(vertexCount * 3)
  const normals = new Float32Array(vertexCount * 3)
  const uvs = keepUv ? new Float32Array(vertexCount * 2) : null
  const index = new Uint32Array(indexCount)
  let vertexOffset = 0
  let indexOffset = 0
  for (const g of geometries) {
    const count = g.getAttribute('position').count
    positions.set(g.getAttribute('position').array as Float32Array, vertexOffset * 3)
    normals.set(g.getAttribute('normal').array as Float32Array, vertexOffset * 3)
    if (uvs) uvs.set(g.getAttribute('uv').array as Float32Array, vertexOffset * 2)
    const source = g.getIndex()!.array
    for (let i = 0; i < source.length; i++) index[indexOffset + i] = source[i] + vertexOffset
    vertexOffset += count
    indexOffset += source.length
    g.dispose()
  }

  const merged = new BufferGeometry()
  merged.setAttribute('position', new BufferAttribute(positions, 3))
  merged.setAttribute('normal', new BufferAttribute(normals, 3))
  if (uvs) merged.setAttribute('uv', new BufferAttribute(uvs, 2))
  merged.setIndex(new BufferAttribute(index, 1))
  return merged
}
