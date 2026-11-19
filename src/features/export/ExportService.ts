import { zipSync } from 'fflate'
import type { RawShaderMaterial, Texture, WebGLRenderTarget } from 'three'
import { createStore, type StoreApi } from 'zustand/vanilla'
import type { AppContext } from '@/core/app/feature'
import { createPassMaterial, GLSL_SRGB, type GpuContext } from '@/core/gpu/GpuContext'
import { createTarget } from '@/core/gpu/targets'
import { downloadBlob, sanitizeFileName } from '@/core/utils/download'
import type { ProjectService } from '@/features/project/ProjectService'
import type { TextureSet } from '@/features/project/TextureSet'
import type { ViewportService } from '@/features/viewport'

export type ExportMapId =
  | 'baseColor'
  | 'normal'
  | 'roughness'
  | 'metallic'
  | 'height'
  | 'ao'
  | 'emissive'
  | 'orm'

export interface ExportMapDef {
  id: ExportMapId
  label: string
  suffix: string
  description: string
}

export const EXPORT_MAPS: ExportMapDef[] = [
  { id: 'baseColor', label: 'Base Color', suffix: 'BaseColor', description: 'sRGB albedo' },
  { id: 'normal', label: 'Normal', suffix: 'Normal', description: 'Tangent space, from height' },
  { id: 'roughness', label: 'Roughness', suffix: 'Roughness', description: 'Grayscale' },
  { id: 'metallic', label: 'Metallic', suffix: 'Metallic', description: 'Grayscale' },
  { id: 'height', label: 'Height', suffix: 'Height', description: 'Mid-gray = zero' },
  { id: 'ao', label: 'Ambient Occlusion', suffix: 'AO', description: 'Grayscale' },
  { id: 'emissive', label: 'Emissive', suffix: 'Emissive', description: 'sRGB' },
  { id: 'orm', label: 'ORM (packed)', suffix: 'ORM', description: 'R: AO, G: roughness, B: metallic' },
]

export type NormalFormat = 'opengl' | 'directx'

export interface ExportOptions {
  maps: ExportMapId[]
  normalFormat: NormalFormat
  /** Export every texture set, or only the active one. */
  scope: 'all' | 'active'
}

export interface ExportState {
  dialogOpen: boolean
  exporting: boolean
  options: ExportOptions
}

const EXPORT_FRAGMENT = /* glsl */ `
uniform sampler2D tSource;
uniform int uMode; // 0 sRGB color, 1 scalar, 2 signed scalar, 3 normal, 4 raw rgb
uniform float uFlipY;
uniform float uFlipGreen;
${GLSL_SRGB}
void main() {
  vec2 uv = vec2(vUv.x, mix(vUv.y, 1.0 - vUv.y, uFlipY));
  vec4 texel = texture(tSource, uv);
  vec3 color = texel.rgb;
  if (uMode == 0) color = linearToSrgb(texel.rgb);
  else if (uMode == 1) color = vec3(texel.r);
  else if (uMode == 2) color = vec3(clamp(texel.r * 0.5 + 0.5, 0.0, 1.0));
  else if (uMode == 3 && uFlipGreen > 0.5) color.g = 1.0 - color.g;
  outColor = vec4(color, 1.0);
}
`

/** Writes the flattened textures of the project to PNG files. */
export class ExportService {
  readonly store: StoreApi<ExportState> = createStore<ExportState>(() => ({
    dialogOpen: false,
    exporting: false,
    options: {
      maps: ['baseColor', 'normal', 'roughness', 'metallic', 'height', 'emissive'],
      normalFormat: 'opengl',
      scope: 'all',
    },
  }))

  private readonly gpu: GpuContext
  private readonly project: ProjectService
  private readonly viewport: ViewportService
  private readonly material: RawShaderMaterial

  constructor(ctx: AppContext) {
    this.viewport = ctx.services.get('viewport')
    this.project = ctx.services.get('project')
    this.gpu = this.viewport.gpu
    this.material = createPassMaterial(EXPORT_FRAGMENT, {
      tSource: { value: null },
      uMode: { value: 0 },
      uFlipY: { value: 0 },
      uFlipGreen: { value: 0 },
    })
  }

  openDialog(): void {
    this.store.setState({ dialogOpen: true })
  }

  closeDialog(): void {
    this.store.setState({ dialogOpen: false })
  }

  setOptions(patch: Partial<ExportOptions>): void {
    this.store.setState((state) => ({ options: { ...state.options, ...patch } }))
  }

  /** Exports with the current options. One map downloads as a PNG, several as a zip. */
  async export(): Promise<number> {
    const { options } = this.store.getState()
    const sets = options.scope === 'active' ? [this.project.active] : this.project.textureSets
    const modelName = sanitizeFileName(this.project.store.getState().modelName ?? 'model')
    this.store.setState({ exporting: true })
    try {
      const files: { name: string; blob: Blob }[] = []
      for (const set of sets) {
        if (!set) continue
        const prefix = sets.length > 1 ? `${modelName}_${sanitizeFileName(set.name)}` : modelName
        for (const id of options.maps) {
          const def = EXPORT_MAPS.find((map) => map.id === id)
          if (!def) continue
          const blob = await this.renderMap(set, id, options.normalFormat)
          files.push({ name: `${prefix}_${def.suffix}.png`, blob })
        }
      }
      if (files.length === 1) {
        downloadBlob(files[0].blob, files[0].name)
      } else if (files.length > 1) {
        const entries: Record<string, Uint8Array> = {}
        for (const file of files) entries[file.name] = new Uint8Array(await file.blob.arrayBuffer())
        // PNGs are already compressed; store them as-is.
        const zipped = zipSync(entries, { level: 0 })
        downloadBlob(new Blob([zipped.buffer as ArrayBuffer], { type: 'application/zip' }), `${modelName}_textures.zip`)
      }
      return files.length
    } finally {
      this.store.setState({ exporting: false })
      this.viewport.requestRender()
    }
  }

  dispose(): void {
    this.material.dispose()
  }

  private sourceFor(set: TextureSet, id: ExportMapId): { texture: Texture; mode: number } {
    switch (id) {
      case 'baseColor':
      case 'emissive':
        return { texture: set.output(id).texture, mode: 0 }
      case 'roughness':
      case 'metallic':
      case 'ao':
        return { texture: set.output(id).texture, mode: 1 }
      case 'height':
        return { texture: set.output('height').texture, mode: 2 }
      case 'normal':
        return { texture: set.normal.texture, mode: 3 }
      case 'orm':
        return { texture: set.orm.texture, mode: 4 }
    }
  }

  private async renderMap(set: TextureSet, id: ExportMapId, normalFormat: NormalFormat): Promise<Blob> {
    const size = set.resolution
    const target: WebGLRenderTarget = createTarget(size, size, 'rgba8')
    try {
      const { texture, mode } = this.sourceFor(set, id)
      const u = this.material.uniforms
      u.tSource.value = texture
      u.uMode.value = mode
      // Read-back rows start at the bottom of the texture, image rows at the top.
      // Assets with v = 0 at the bottom therefore need a vertical flip.
      u.uFlipY.value = set.uvOrigin === 'bottom-left' ? 1 : 0
      // Internally +Y of the normal map follows +v. Whether that is "green up"
      // in the image depends on the asset's UV origin.
      u.uFlipGreen.value = (set.uvOrigin === 'top-left') !== (normalFormat === 'directx') ? 1 : 0
      this.gpu.pass(this.material, target)
      const pixels = this.gpu.readPixels(target)
      this.gpu.end()
      return await encodePng(pixels, size, size)
    } finally {
      target.dispose()
    }
  }
}

async function encodePng(pixels: Uint8Array, width: number, height: number): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  const data = new Uint8ClampedArray(pixels.buffer as ArrayBuffer, pixels.byteOffset, pixels.byteLength)
  ctx.putImageData(new ImageData(data, width, height), 0, 0)
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG encoding failed'))), 'image/png')
  })
}
