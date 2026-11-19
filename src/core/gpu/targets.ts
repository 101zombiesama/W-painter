import {
  ClampToEdgeWrapping,
  FloatType,
  HalfFloatType,
  LinearFilter,
  LinearMipmapLinearFilter,
  NearestFilter,
  NoColorSpace,
  RedFormat,
  RGBAFormat,
  RGFormat,
  SRGBColorSpace,
  UnsignedByteType,
  WebGLRenderTarget,
  type ColorSpace,
  type PixelFormat,
  type TextureDataType,
} from 'three'

/**
 * The texture formats the engine renders into.
 * `srgba8` stores sRGB-encoded bytes and is decoded by the GPU when sampled.
 */
export type TargetFormat =
  | 'rgba8'
  | 'srgba8'
  | 'rg8'
  | 'r8'
  | 'r16f'
  | 'rg16f'
  | 'rgba16f'
  | 'rg32f'
  | 'rgba32f'

interface FormatInfo {
  format: PixelFormat
  type: TextureDataType
  colorSpace: ColorSpace
  bytesPerTexel: number
}

const FORMATS: Record<TargetFormat, FormatInfo> = {
  rgba8: { format: RGBAFormat, type: UnsignedByteType, colorSpace: NoColorSpace, bytesPerTexel: 4 },
  srgba8: { format: RGBAFormat, type: UnsignedByteType, colorSpace: SRGBColorSpace, bytesPerTexel: 4 },
  rg8: { format: RGFormat, type: UnsignedByteType, colorSpace: NoColorSpace, bytesPerTexel: 2 },
  r8: { format: RedFormat, type: UnsignedByteType, colorSpace: NoColorSpace, bytesPerTexel: 1 },
  r16f: { format: RedFormat, type: HalfFloatType, colorSpace: NoColorSpace, bytesPerTexel: 2 },
  rg16f: { format: RGFormat, type: HalfFloatType, colorSpace: NoColorSpace, bytesPerTexel: 4 },
  rgba16f: { format: RGBAFormat, type: HalfFloatType, colorSpace: NoColorSpace, bytesPerTexel: 8 },
  rg32f: { format: RGFormat, type: FloatType, colorSpace: NoColorSpace, bytesPerTexel: 8 },
  rgba32f: { format: RGBAFormat, type: FloatType, colorSpace: NoColorSpace, bytesPerTexel: 16 },
}

export interface TargetOptions {
  filter?: 'nearest' | 'linear'
  /** Regenerates a full mip chain every time the target is rendered to. */
  mipmaps?: boolean
  anisotropy?: number
}

export function createTarget(
  width: number,
  height: number,
  format: TargetFormat,
  options: TargetOptions = {},
): WebGLRenderTarget {
  const info = FORMATS[format]
  const linear = options.filter === 'linear' || options.mipmaps === true
  const target = new WebGLRenderTarget(width, height, {
    format: info.format,
    type: info.type,
    colorSpace: info.colorSpace,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: options.mipmaps === true,
    minFilter: options.mipmaps ? LinearMipmapLinearFilter : linear ? LinearFilter : NearestFilter,
    magFilter: linear ? LinearFilter : NearestFilter,
    wrapS: ClampToEdgeWrapping,
    wrapT: ClampToEdgeWrapping,
    anisotropy: options.anisotropy ?? 1,
  })
  target.texture.userData.format = format
  return target
}

export function targetFormat(target: WebGLRenderTarget): TargetFormat {
  return target.texture.userData.format as TargetFormat
}

/** GPU memory used by a target's base level (mips add roughly one third). */
export function targetBytes(target: WebGLRenderTarget): number {
  const info = FORMATS[targetFormat(target)]
  const mipFactor = target.texture.generateMipmaps ? 4 / 3 : 1
  return Math.round(target.width * target.height * info.bytesPerTexel * mipFactor)
}

export function formatBytesPerTexel(format: TargetFormat): number {
  return FORMATS[format].bytesPerTexel
}
