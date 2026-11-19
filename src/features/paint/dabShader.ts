import {
  AddEquation,
  CustomBlending,
  OneFactor,
  OneMinusSrcAlphaFactor,
  type RawShaderMaterial,
} from 'three'
import { createPassMaterial } from '@/core/gpu/GpuContext'

/** Dabs evaluated per pass. One pass is one full-rect draw, whatever the count. */
export const MAX_DABS = 16

/**
 * Accumulates brush dabs into the stroke buffer.
 *
 * Runs in texture space: for every texel it looks up the surface position
 * from the baked position map and tests it against each dab's oriented
 * brush volume. Because it never touches the mesh, the cost is independent
 * of polygon count, and seams are painted correctly on both sides.
 */
const DAB_FRAGMENT = /* glsl */ `
#define MAX_DABS ${MAX_DABS}
uniform sampler2D tPosition;
uniform sampler2D tNormal;
uniform sampler2D tTip;
uniform int uCount;
uniform vec4 uDabA[MAX_DABS]; // xyz = center, w = radius
uniform vec4 uDabB[MAX_DABS]; // xyz = brush normal, w = flow
uniform vec4 uDabC[MAX_DABS]; // xyz = tangent (tip +x), w = tip mip level
uniform vec4 uDabD[MAX_DABS]; // xyz = bitangent (tip +y)
uniform float uHardness;
uniform float uUseTip;
uniform float uTinted;
uniform float uBackface;

void main() {
  vec4 surface = texture(tPosition, vUv);
  if (surface.a < 0.01) discard;
  vec3 position = surface.xyz / surface.a;
  vec4 encodedNormal = texture(tNormal, vUv);
  vec3 normal = normalize(encodedNormal.xyz / max(encodedNormal.a, 0.01) * 2.0 - 1.0);

  // Premultiplied tint + coverage, composited over dab by dab.
  vec4 acc = vec4(0.0);
  for (int i = 0; i < MAX_DABS; i++) {
    if (i >= uCount) break;
    vec3 d = position - uDabA[i].xyz;
    float radius = uDabA[i].w;
    vec3 brushNormal = uDabB[i].xyz;
    vec2 p = vec2(dot(d, uDabC[i].xyz), dot(d, uDabD[i].xyz)) / radius;
    float depth = abs(dot(d, brushNormal)) / radius;
    if (abs(p.x) >= 1.0 || abs(p.y) >= 1.0 || depth >= 1.0) continue;

    // 'a' is coverage; 'premult' is the tint already multiplied by coverage.
    float a;
    vec3 premult;
    if (uUseTip > 0.5) {
      vec4 tip = textureLod(tTip, p * 0.5 + 0.5, uDabC[i].w);
      a = tip.a;
      // Tinted tips are uploaded premultiplied so filtering has no dark fringes.
      premult = uTinted > 0.5 ? tip.rgb : vec3(tip.a);
    } else {
      a = 1.0 - smoothstep(uHardness, 1.0, length(p));
      premult = vec3(a);
    }
    // Fade out along the brush axis so paint does not punch through thin parts.
    float k = 1.0 - smoothstep(0.5, 1.0, depth);
    k *= mix(1.0, smoothstep(-0.15, 0.2, dot(normal, brushNormal)), uBackface);
    k *= uDabB[i].w;

    acc = vec4(premult * k, a * k) + acc * (1.0 - a * k);
  }
  if (acc.a <= 0.0) discard;
  outColor = uTinted > 0.5 ? acc : vec4(acc.a, 0.0, 0.0, acc.a);
}
`

export function createDabMaterial(): RawShaderMaterial {
  return createPassMaterial(
    DAB_FRAGMENT,
    {
      tPosition: { value: null },
      tNormal: { value: null },
      tTip: { value: null },
      uCount: { value: 0 },
      uDabA: { value: new Float32Array(MAX_DABS * 4) },
      uDabB: { value: new Float32Array(MAX_DABS * 4) },
      uDabC: { value: new Float32Array(MAX_DABS * 4) },
      uDabD: { value: new Float32Array(MAX_DABS * 4) },
      uHardness: { value: 0.5 },
      uUseTip: { value: 0 },
      uTinted: { value: 0 },
      uBackface: { value: 1 },
    },
    {
      // "Over" compositing with premultiplied alpha: dst = src + dst * (1 - src.a)
      blending: CustomBlending,
      blendEquation: AddEquation,
      blendSrc: OneFactor,
      blendDst: OneMinusSrcAlphaFactor,
      blendSrcAlpha: OneFactor,
      blendDstAlpha: OneMinusSrcAlphaFactor,
    },
  )
}
