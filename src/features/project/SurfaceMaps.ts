import {
  DoubleSide,
  GLSL3,
  Mesh,
  NoBlending,
  RawShaderMaterial,
  type BufferGeometry,
  type WebGLRenderTarget,
} from 'three'
import { createPassMaterial, type GpuContext } from '@/core/gpu/GpuContext'
import { createTarget } from '@/core/gpu/targets'

const UV_SPACE_VERTEX = /* glsl */ `
in vec3 position;
in vec3 normal;
in vec2 uv;
out vec3 vPosition;
out vec3 vNormal;
void main() {
  vPosition = position;
  vNormal = normal;
  gl_Position = vec4(uv * 2.0 - 1.0, 0.0, 1.0);
}
`

const UV_SPACE_FRAGMENT = /* glsl */ `
precision highp float;
uniform int uMode;
in vec3 vPosition;
in vec3 vNormal;
out vec4 outColor;
void main() {
  outColor = vec4(uMode == 0 ? vPosition : normalize(vNormal), 1.0);
}
`

const JFA_SEED = /* glsl */ `
uniform sampler2D tCoverage;
void main() {
  float covered = texture(tCoverage, vUv).a;
  outColor = vec4(covered > 0.5 ? gl_FragCoord.xy : vec2(-1.0e4), 0.0, 1.0);
}
`

const JFA_STEP = /* glsl */ `
uniform sampler2D tSeeds;
uniform float uStep;
uniform vec2 uTexel;
void main() {
  vec2 best = vec2(-1.0e4);
  float bestDistance = 1.0e20;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 uv = vUv + vec2(float(x), float(y)) * uStep * uTexel;
      if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) continue;
      vec2 seed = texture(tSeeds, uv).xy;
      if (seed.x < 0.0) continue;
      vec2 delta = seed - gl_FragCoord.xy;
      float distance2 = dot(delta, delta);
      if (distance2 < bestDistance) {
        bestDistance = distance2;
        best = seed;
      }
    }
  }
  outColor = vec4(best, 0.0, 1.0);
}
`

const DILATE_RESOLVE = /* glsl */ `
uniform sampler2D tSeeds;
uniform sampler2D tRaw;
uniform float uMaxDistance;
uniform float uEncodeUnit; // 1: remap a unit vector from [-1, 1] to [0, 1]
void main() {
  vec2 seed = texture(tSeeds, vUv).xy;
  if (seed.x < 0.0 || distance(seed, gl_FragCoord.xy) > uMaxDistance) {
    outColor = vec4(0.0);
    return;
  }
  vec3 value = texelFetch(tRaw, ivec2(seed), 0).xyz;
  if (uEncodeUnit > 0.5) value = normalize(value) * 0.5 + 0.5;
  // Alpha 1 marks a paintable texel; values are effectively premultiplied.
  outColor = vec4(value, 1.0);
}
`

/**
 * Per-texel world position and normal of a mesh, baked in UV space.
 *
 * Brushes are evaluated against these maps instead of the mesh itself, which
 * makes painting cost independent of polygon count. Both maps are dilated
 * past the UV island borders (jump flooding) so strokes bleed into the
 * gutters and texture filtering never shows seams.
 */
export class SurfaceMaps {
  readonly size: number
  /** xyz = world position * a, a = validity (divide by a after filtering). */
  readonly position: WebGLRenderTarget
  /** xyz = (world normal * 0.5 + 0.5) * a, a = validity. 8-bit is plenty for facing tests. */
  readonly normal: WebGLRenderTarget
  /** How far (in map texels) islands were dilated into the gutters. */
  readonly margin: number

  constructor(gpu: GpuContext, geometry: BufferGeometry, size: number) {
    this.size = size
    this.margin = Math.max(4, Math.round(size / 128))

    const rawPosition = createTarget(size, size, 'rgba32f')
    const rawNormal = createTarget(size, size, 'rgba16f')
    const seedsA = createTarget(size, size, 'rg32f')
    const seedsB = createTarget(size, size, 'rg32f')
    this.position = createTarget(size, size, 'rgba32f', {
      filter: gpu.caps.floatLinear ? 'linear' : 'nearest',
    })
    this.normal = createTarget(size, size, 'rgba8', { filter: 'linear' })

    // 1. Rasterize the mesh into its own UV layout.
    const bakeMaterial = new RawShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: UV_SPACE_VERTEX,
      fragmentShader: UV_SPACE_FRAGMENT,
      uniforms: { uMode: { value: 0 } },
      side: DoubleSide,
      depthTest: false,
      depthWrite: false,
      blending: NoBlending,
    })
    const bakeMesh = new Mesh(geometry, bakeMaterial)
    bakeMesh.frustumCulled = false
    bakeMesh.matrixAutoUpdate = false

    gpu.fill(rawPosition, 0, 0, 0, 0)
    gpu.renderObject(bakeMesh, gpu.passCamera, rawPosition)
    bakeMaterial.uniforms.uMode.value = 1
    gpu.fill(rawNormal, 0, 0, 0, 0)
    gpu.renderObject(bakeMesh, gpu.passCamera, rawNormal)

    // 2. Jump flooding: every texel learns its nearest covered texel.
    const seedMaterial = createPassMaterial(JFA_SEED, { tCoverage: { value: rawPosition.texture } })
    gpu.pass(seedMaterial, seedsA)

    const stepMaterial = createPassMaterial(JFA_STEP, {
      tSeeds: { value: null },
      uStep: { value: 1 },
      uTexel: { value: [1 / size, 1 / size] },
    })
    let read = seedsA
    let write = seedsB
    const steps: number[] = []
    for (let step = nextPowerOfTwo(this.margin); step >= 1; step /= 2) steps.push(step)
    steps.push(1) // "JFA+1": one extra unit step removes most residual errors.
    for (const step of steps) {
      stepMaterial.uniforms.tSeeds.value = read.texture
      stepMaterial.uniforms.uStep.value = step
      gpu.pass(stepMaterial, write)
      const swap = read
      read = write
      write = swap
    }

    // 3. Copy each gutter texel from its nearest covered texel.
    const resolveMaterial = createPassMaterial(DILATE_RESOLVE, {
      tSeeds: { value: read.texture },
      tRaw: { value: rawPosition.texture },
      uMaxDistance: { value: this.margin + 0.5 },
      uEncodeUnit: { value: 0 },
    })
    gpu.pass(resolveMaterial, this.position)
    resolveMaterial.uniforms.tRaw.value = rawNormal.texture
    resolveMaterial.uniforms.uEncodeUnit.value = 1
    gpu.pass(resolveMaterial, this.normal)
    gpu.end()

    rawPosition.dispose()
    rawNormal.dispose()
    seedsA.dispose()
    seedsB.dispose()
    bakeMaterial.dispose()
    seedMaterial.dispose()
    stepMaterial.dispose()
    resolveMaterial.dispose()
  }

  dispose(): void {
    this.position.dispose()
    this.normal.dispose()
  }
}

function nextPowerOfTwo(value: number): number {
  let p = 1
  while (p < value) p *= 2
  return p
}
