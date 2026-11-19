import { BufferAttribute, BufferGeometry } from 'three'
import type { UnwrapMethod, UnwrapRequest, UnwrapResponse } from './unwrap.worker'

export interface UvAnalysis {
  hasUVs: boolean
  /** Some coordinates fall outside the 0..1 square (UDIMs or tiling). */
  outOfRange: boolean
  /** Total UV area exceeds the square, so islands must overlap. */
  overlapping: boolean
}

export interface UnwrapResult {
  geometry: BufferGeometry
  method: UnwrapMethod
  charts: number
  milliseconds: number
}

/** Above this size LSCM gets slow; box projection handles millions of triangles. */
const LSCM_TRIANGLE_LIMIT = 150_000

/** Inspects and generates UV layouts. Unwrapping runs in a web worker. */
export class UvService {
  analyze(geometry: BufferGeometry): UvAnalysis {
    const uv = geometry.getAttribute('uv')
    if (!uv) return { hasUVs: false, outOfRange: false, overlapping: false }

    // A small tolerance: some exporters (and three's sphere poles) overshoot slightly.
    const tolerance = 0.01
    let outOfRange = false
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i)
      const v = uv.getY(i)
      if (u < -tolerance || u > 1 + tolerance || v < -tolerance || v > 1 + tolerance) {
        outOfRange = true
        break
      }
    }

    const index = geometry.getIndex()
    const triangles = (index ? index.count : uv.count) / 3
    let area = 0
    for (let t = 0; t < triangles; t++) {
      const a = index ? index.getX(t * 3) : t * 3
      const b = index ? index.getX(t * 3 + 1) : t * 3 + 1
      const c = index ? index.getX(t * 3 + 2) : t * 3 + 2
      area += Math.abs(
        (uv.getX(b) - uv.getX(a)) * (uv.getY(c) - uv.getY(a)) -
          (uv.getX(c) - uv.getX(a)) * (uv.getY(b) - uv.getY(a)),
      )
    }
    return { hasUVs: true, outOfRange, overlapping: area * 0.5 > 1.02 }
  }

  /**
   * Builds a new geometry with a unique, non-overlapping UV layout.
   * `auto` picks LSCM for light meshes and box projection for heavy ones.
   */
  unwrap(geometry: BufferGeometry, method: UnwrapMethod | 'auto' = 'auto'): Promise<UnwrapResult> {
    const position = geometry.getAttribute('position')
    const normal = geometry.getAttribute('normal')
    const index = geometry.getIndex()
    const triangles = (index ? index.count : position.count) / 3

    const request: UnwrapRequest = {
      // Copies: the originals stay usable if the worker fails.
      positions: new Float32Array(position.array),
      normals: new Float32Array(normal.array),
      index: index ? Uint32Array.from(index.array) : null,
      method: method === 'auto' ? (triangles <= LSCM_TRIANGLE_LIMIT ? 'lscm' : 'box') : method,
    }

    return new Promise<UnwrapResult>((resolve, reject) => {
      const worker = new Worker(new URL('./unwrap.worker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = (event: MessageEvent<UnwrapResponse>) => {
        worker.terminate()
        const response = event.data
        if (!response.ok) {
          reject(new Error(response.error))
          return
        }
        const result = new BufferGeometry()
        result.setAttribute('position', new BufferAttribute(response.positions, 3))
        result.setAttribute('normal', new BufferAttribute(response.normals, 3))
        result.setAttribute('uv', new BufferAttribute(response.uvs, 2))
        result.setIndex(new BufferAttribute(response.index, 1))
        resolve({
          geometry: result,
          method: response.method,
          charts: response.charts,
          milliseconds: response.milliseconds,
        })
      }
      worker.onerror = (event) => {
        worker.terminate()
        reject(new Error(event.message || 'UV unwrap worker failed'))
      }
      const transfer: Transferable[] = [request.positions.buffer, request.normals.buffer]
      if (request.index) transfer.push(request.index.buffer)
      worker.postMessage(request, transfer)
    })
  }
}
