import { BufferAttribute, BufferGeometry, Mesh } from 'three'
import { unwrapUVs } from 'three/addons/utils/unwrapUVs.js'
import { boxUnwrap, type UnwrapInput, type UnwrapOutput } from './boxUnwrap'

export type UnwrapMethod = 'lscm' | 'box'

export interface UnwrapRequest extends UnwrapInput {
  method: UnwrapMethod
}

export type UnwrapResponse =
  | ({ ok: true; method: UnwrapMethod; milliseconds: number } & UnwrapOutput)
  | { ok: false; error: string }

/**
 * Conformal atlas: charts are grown over smooth regions and flattened with
 * LSCM (three.js' unwrapUVs), giving large, low-distortion islands.
 */
function lscmUnwrap(input: UnwrapInput): UnwrapOutput | null {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(input.positions, 3))
  geometry.setAttribute('normal', new BufferAttribute(input.normals, 3))
  if (input.index) geometry.setIndex(new BufferAttribute(input.index, 1))
  const mesh = new Mesh(geometry)

  const result = unwrapUVs(mesh, { attribute: 'uv', mode: 'normal', resolution: 1024, padding: 5 })
  if (!result) return null

  const out = mesh.geometry
  const index = out.getIndex()
  const uv = out.getAttribute('uv')
  if (!index || !uv) return null
  return {
    positions: new Float32Array(out.getAttribute('position').array),
    normals: new Float32Array(out.getAttribute('normal').array),
    uvs: new Float32Array(uv.array),
    index: Uint32Array.from(index.array),
    charts: result.charts.length,
  }
}

/** The worker global scope, typed locally to avoid mixing DOM and WebWorker libs. */
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<UnwrapRequest>) => void) | null
  postMessage(message: UnwrapResponse, transfer?: Transferable[]): void
}

scope.onmessage = (event) => {
  const request = event.data
  const start = performance.now()
  let response: UnwrapResponse
  try {
    let method = request.method
    let output: UnwrapOutput | null = null
    if (method === 'lscm') {
      try {
        output = lscmUnwrap(request)
      } catch (error) {
        console.warn('LSCM unwrap failed, falling back to box projection.', error)
      }
      if (!output) method = 'box'
    }
    output ??= boxUnwrap(request)
    response = { ok: true, method, milliseconds: performance.now() - start, ...output }
  } catch (error) {
    response = { ok: false, error: error instanceof Error ? error.message : String(error) }
  }

  if (response.ok) {
    const transfer = [
      response.positions.buffer,
      response.normals.buffer,
      response.uvs.buffer,
      response.index.buffer,
    ]
    scope.postMessage(response, transfer)
  } else {
    scope.postMessage(response)
  }
}
