import {
  BufferAttribute,
  BufferGeometry,
  GLSL3,
  Mesh,
  NoBlending,
  OrthographicCamera,
  RawShaderMaterial,
  Scene,
  Vector4,
  type Camera,
  type IUniform,
  type Material,
  type Object3D,
  type ShaderMaterialParameters,
  type Texture,
  type WebGLRenderer,
  type WebGLRenderTarget,
} from 'three'
import type { PxRect } from './Rect'

/** Vertex shader shared by every full-screen pass. */
export const FULLSCREEN_VERTEX = /* glsl */ `
in vec3 position;
out vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

/** Prelude for full-screen fragment shaders (GLSL ES 3.00). */
export const FRAGMENT_HEADER = /* glsl */ `
precision highp float;
precision highp int;
precision highp sampler2D;
in vec2 vUv;
out vec4 outColor;
`

export const GLSL_SRGB = /* glsl */ `
vec3 srgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}
vec3 linearToSrgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
`

/** Creates a material for `GpuContext.pass`. The fragment source must write `outColor`. */
export function createPassMaterial(
  fragmentBody: string,
  uniforms: Record<string, IUniform>,
  parameters: ShaderMaterialParameters = {},
): RawShaderMaterial {
  return new RawShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: FULLSCREEN_VERTEX,
    fragmentShader: FRAGMENT_HEADER + fragmentBody,
    uniforms,
    depthTest: false,
    depthWrite: false,
    blending: NoBlending,
    toneMapped: false,
    ...parameters,
  })
}

export interface GpuCapabilities {
  /** 32-bit float textures can be sampled with linear filtering. */
  floatLinear: boolean
  maxTextureSize: number
  maxAnisotropy: number
}

/**
 * Thin layer over the three.js renderer for GPGPU-style work: full-screen
 * passes into render targets, optionally restricted to a dirty rectangle.
 */
export class GpuContext {
  readonly renderer: WebGLRenderer
  readonly caps: GpuCapabilities

  private readonly scene = new Scene()
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private readonly quad: Mesh

  private readonly fillMaterial: RawShaderMaterial
  private readonly copyMaterial: RawShaderMaterial
  private readonly copyRectMaterial: RawShaderMaterial

  constructor(renderer: WebGLRenderer) {
    this.renderer = renderer
    this.caps = {
      floatLinear: renderer.extensions.has('OES_texture_float_linear'),
      maxTextureSize: renderer.capabilities.maxTextureSize,
      maxAnisotropy: renderer.capabilities.getMaxAnisotropy(),
    }

    // One oversized triangle covers the viewport without a diagonal seam.
    const geometry = new BufferGeometry()
    geometry.setAttribute(
      'position',
      new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3),
    )
    this.quad = new Mesh(geometry)
    this.quad.frustumCulled = false
    this.scene.add(this.quad)
    this.scene.matrixWorldAutoUpdate = false

    this.fillMaterial = createPassMaterial(
      /* glsl */ `
      uniform vec4 uColor;
      void main() { outColor = uColor; }
      `,
      { uColor: { value: new Vector4() } },
    )

    this.copyMaterial = createPassMaterial(
      /* glsl */ `
      uniform sampler2D tSource;
      void main() { outColor = texture(tSource, vUv); }
      `,
      { tSource: { value: null } },
    )

    this.copyRectMaterial = createPassMaterial(
      /* glsl */ `
      uniform sampler2D tSource;
      uniform vec4 uSourceRect; // xy = offset, zw = size, in source UV units
      void main() { outColor = texture(tSource, uSourceRect.xy + vUv * uSourceRect.zw); }
      `,
      { tSource: { value: null }, uSourceRect: { value: new Vector4() } },
    )
  }

  /** Runs a full-screen pass into `target`, optionally limited to `region`. */
  pass(material: Material, target: WebGLRenderTarget, region?: PxRect | null): void {
    if (region && (region.w <= 0 || region.h <= 0)) return
    const renderer = this.renderer
    target.viewport.set(0, 0, target.width, target.height)
    if (region) {
      target.scissorTest = true
      target.scissor.set(region.x, region.y, region.w, region.h)
    } else {
      target.scissorTest = false
    }
    const autoClear = renderer.autoClear
    renderer.autoClear = false
    renderer.setRenderTarget(target)
    this.quad.material = material
    renderer.render(this.scene, this.camera)
    renderer.autoClear = autoClear
    target.scissorTest = false
  }

  /** Writes a constant value. Used instead of gl.clear to avoid color-space conversions. */
  fill(
    target: WebGLRenderTarget,
    r: number,
    g: number,
    b: number,
    a: number,
    region?: PxRect | null,
  ): void {
    this.fillMaterial.uniforms.uColor.value.set(r, g, b, a)
    this.pass(this.fillMaterial, target, region)
  }

  /** 1:1 copy between targets of the same size (or a resample when sizes differ). */
  copy(source: Texture, target: WebGLRenderTarget, region?: PxRect | null): void {
    this.copyMaterial.uniforms.tSource.value = source
    this.pass(this.copyMaterial, target, region)
    this.copyMaterial.uniforms.tSource.value = null
  }

  /**
   * Copies a sub-rectangle of `source` into a sub-rectangle of `target`.
   * Rect sizes should match for an exact texel copy.
   */
  copyRect(
    source: Texture,
    sourceWidth: number,
    sourceHeight: number,
    sourceRect: PxRect,
    target: WebGLRenderTarget,
    targetRect: PxRect,
  ): void {
    if (targetRect.w <= 0 || targetRect.h <= 0) return
    const renderer = this.renderer
    this.copyRectMaterial.uniforms.tSource.value = source
    this.copyRectMaterial.uniforms.uSourceRect.value.set(
      sourceRect.x / sourceWidth,
      sourceRect.y / sourceHeight,
      sourceRect.w / sourceWidth,
      sourceRect.h / sourceHeight,
    )
    target.viewport.set(targetRect.x, targetRect.y, targetRect.w, targetRect.h)
    target.scissor.set(targetRect.x, targetRect.y, targetRect.w, targetRect.h)
    target.scissorTest = true
    const autoClear = renderer.autoClear
    renderer.autoClear = false
    renderer.setRenderTarget(target)
    this.quad.material = this.copyRectMaterial
    renderer.render(this.scene, this.camera)
    renderer.autoClear = autoClear
    target.scissorTest = false
    target.viewport.set(0, 0, target.width, target.height)
    this.copyRectMaterial.uniforms.tSource.value = null
  }

  /** Renders arbitrary geometry (e.g. a mesh in UV space) into a target. */
  renderObject(object: Object3D, camera: Camera, target: WebGLRenderTarget): void {
    const renderer = this.renderer
    target.viewport.set(0, 0, target.width, target.height)
    target.scissorTest = false
    const autoClear = renderer.autoClear
    renderer.autoClear = false
    renderer.setRenderTarget(target)
    renderer.render(object, camera)
    renderer.autoClear = autoClear
  }

  /** Reads back an RGBA8 target. Rows are returned bottom-up. */
  readPixels(target: WebGLRenderTarget, rect?: PxRect): Uint8Array {
    const r = rect ?? { x: 0, y: 0, w: target.width, h: target.height }
    const buffer = new Uint8Array(r.w * r.h * 4)
    this.renderer.readRenderTargetPixels(target, r.x, r.y, r.w, r.h, buffer)
    return buffer
  }

  /** Restores rendering to the canvas. Call after a batch of passes. */
  end(): void {
    this.renderer.setRenderTarget(null)
  }

  /** A camera suitable for `renderObject` when the shader ignores matrices. */
  get passCamera(): Camera {
    return this.camera
  }
}
