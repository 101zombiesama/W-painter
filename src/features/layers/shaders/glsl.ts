import { GLSL_SRGB } from '@/core/gpu/GpuContext'

/** Photoshop-style separable blend modes. Indices match BLEND_MODES. */
export const BLEND_GLSL = /* glsl */ `
vec3 blendColors(int mode, vec3 d, vec3 s) {
  if (mode == 1) return d * s;
  if (mode == 2) return 1.0 - (1.0 - d) * (1.0 - s);
  if (mode == 3) return mix(2.0 * d * s, 1.0 - 2.0 * (1.0 - d) * (1.0 - s), step(0.5, d));
  if (mode == 4) return d + s;
  if (mode == 5) return d - s;
  if (mode == 6) return min(d, s);
  if (mode == 7) return max(d, s);
  return s;
}
`

/**
 * How a stroke's coverage buffer modifies layer content or a mask. Shared by
 * the live preview (compositor) and the final bake so they match exactly.
 */
export const STROKE_GLSL = /* glsl */ `
uniform sampler2D tStroke;
uniform float uStrokeTinted;
uniform float uStrokeOpacity;
uniform int uStrokeMode; // 0 paint, 1 erase
uniform vec3 uBrushValue;
uniform float uBrushTint; // 1: multiply the painted value by the stroke's tint
uniform float uMaskValue;

// Returns premultiplied tint in rgb and coverage in a.
vec4 readStroke(vec2 uv) {
  vec4 s = texture(tStroke, uv);
  return uStrokeTinted > 0.5 ? s : vec4(s.r);
}

// 'layer' is straight (non-premultiplied) value + alpha.
vec4 applyStroke(vec4 layer, vec4 stroke) {
  float a = clamp(stroke.a, 0.0, 1.0) * uStrokeOpacity;
  if (uStrokeMode == 1) return vec4(layer.rgb, layer.a * (1.0 - a));
  vec3 tint = stroke.a > 1.0e-5 ? clamp(stroke.rgb / stroke.a, 0.0, 1.0) : vec3(1.0);
  vec3 value = uBrushValue * mix(vec3(1.0), tint, uBrushTint);
  float outA = a + layer.a * (1.0 - a);
  vec3 outRgb = outA > 1.0e-5 ? (value * a + layer.rgb * layer.a * (1.0 - a)) / outA : layer.rgb;
  return vec4(outRgb, outA);
}

float applyStrokeToMask(float m, vec4 stroke) {
  float a = clamp(stroke.a, 0.0, 1.0) * uStrokeOpacity;
  return mix(m, uStrokeMode == 1 ? 0.0 : uMaskValue, a);
}
`

/**
 * Blends one layer onto the accumulated result below it.
 *
 * Defines:
 *   SCALAR          layer texture is RG (value, alpha) instead of RGBA
 *   SOURCE_FILL     layer content is the uniform uFill
 *   SOURCE_EMPTY    layer has no texture yet (only a live stroke)
 *   USE_MASK        multiply coverage by tMask.r
 *   STROKE_CONTENT  preview the active stroke on the layer content
 *   STROKE_MASK     preview the active stroke on the mask
 */
export const BLEND_LAYER_FRAGMENT = /* glsl */ `
uniform sampler2D tDst;
uniform sampler2D tLayer;
uniform sampler2D tMask;
uniform vec3 uFill;
uniform float uOpacity;
uniform int uBlend;
${BLEND_GLSL}
${STROKE_GLSL}
void main() {
  vec3 dst = texture(tDst, vUv).rgb;

  #if defined(SOURCE_FILL)
    vec4 src = vec4(uFill, 1.0);
  #elif defined(SOURCE_EMPTY)
    vec4 src = vec4(0.0);
  #else
    vec4 src = texture(tLayer, vUv);
    #ifdef SCALAR
      src = vec4(src.rrr, src.g);
    #endif
  #endif

  #ifdef STROKE_CONTENT
    src = applyStroke(src, readStroke(vUv));
  #endif

  float alpha = src.a * uOpacity;
  #ifdef USE_MASK
    float m = texture(tMask, vUv).r;
    #ifdef STROKE_MASK
      m = applyStrokeToMask(m, readStroke(vUv));
    #endif
    alpha *= m;
  #endif

  outColor = vec4(mix(dst, blendColors(uBlend, dst, src.rgb), alpha), 1.0);
}
`

/**
 * Permanently applies a stroke to a layer texture (or mask).
 * tLayer is a snapshot of the affected rectangle taken before the bake.
 *
 * Defines: SCALAR, TARGET_MASK
 */
export const BAKE_STROKE_FRAGMENT = /* glsl */ `
uniform sampler2D tLayer;
uniform vec4 uPatchRect; // xy = origin, zw = size, in target pixels
${STROKE_GLSL}
void main() {
  vec2 patchUv = (gl_FragCoord.xy - uPatchRect.xy) / uPatchRect.zw;
  vec4 stroke = readStroke(vUv);
  #ifdef TARGET_MASK
    outColor = vec4(applyStrokeToMask(texture(tLayer, patchUv).r, stroke), 0.0, 0.0, 1.0);
  #else
    vec4 src = texture(tLayer, patchUv);
    #ifdef SCALAR
      src = vec4(src.rrr, src.g);
    #endif
    src = applyStroke(src, stroke);
    #ifdef SCALAR
      outColor = vec4(src.r, src.a, 0.0, 1.0);
    #else
      outColor = src;
    #endif
  #endif
}
`

/** Copies a flattened channel into its output texture. */
export const RESOLVE_FRAGMENT = /* glsl */ `
uniform sampler2D tSource;
uniform int uMode; // 0 copy, 1 sRGB-encoded source into an sRGB target
${GLSL_SRGB}
void main() {
  vec4 c = texture(tSource, vUv);
  // The GPU re-encodes on write to an sRGB target, so hand it linear values.
  if (uMode == 1) c.rgb = srgbToLinear(clamp(c.rgb, 0.0, 1.0));
  outColor = vec4(c.rgb, 1.0);
}
`

export const PACK_ORM_FRAGMENT = /* glsl */ `
uniform sampler2D tOcclusion;
uniform sampler2D tRoughness;
uniform sampler2D tMetallic;
void main() {
  outColor = vec4(
    texture(tOcclusion, vUv).r,
    texture(tRoughness, vUv).r,
    texture(tMetallic, vUv).r,
    1.0
  );
}
`

/** Derives a tangent-space normal map from height with a Sobel filter. */
export const HEIGHT_TO_NORMAL_FRAGMENT = /* glsl */ `
uniform sampler2D tHeight;
uniform vec2 uTexel;
uniform float uStrength;
float h(vec2 offset) {
  return texture(tHeight, vUv + offset * uTexel).r;
}
void main() {
  float tl = h(vec2(-1.0, 1.0)), t = h(vec2(0.0, 1.0)), tr = h(vec2(1.0, 1.0));
  float l = h(vec2(-1.0, 0.0)), r = h(vec2(1.0, 0.0));
  float bl = h(vec2(-1.0, -1.0)), b = h(vec2(0.0, -1.0)), br = h(vec2(1.0, -1.0));
  float dx = (tr + 2.0 * r + br) - (tl + 2.0 * l + bl);
  float dy = (tl + 2.0 * t + tr) - (bl + 2.0 * b + br);
  vec3 n = normalize(vec3(-dx * uStrength, -dy * uStrength, 1.0));
  outColor = vec4(n * 0.5 + 0.5, 1.0);
}
`

export const INVERT_MASK_FRAGMENT = /* glsl */ `
uniform sampler2D tSource;
void main() {
  outColor = vec4(1.0 - texture(tSource, vUv).r, 0.0, 0.0, 1.0);
}
`
