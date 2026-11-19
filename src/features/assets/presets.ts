import { clamp, srgbToLinear, linearToSrgb, type RGB } from '@/core/utils/math'
import type { BrushSettings } from '@/features/paint/store'

export interface MaterialPreset {
  id: string
  name: string
  /** sRGB base color. */
  color: RGB
  roughness: number
  metallic: number
  /** Optional emissive color (sRGB). */
  emissive?: RGB
}

export const MATERIAL_PRESETS: MaterialPreset[] = [
  { id: 'mat-gold', name: 'Gold', color: [1.0, 0.78, 0.34], roughness: 0.22, metallic: 1 },
  { id: 'mat-silver', name: 'Silver', color: [0.97, 0.96, 0.92], roughness: 0.18, metallic: 1 },
  { id: 'mat-chrome', name: 'Chrome', color: [0.78, 0.78, 0.79], roughness: 0.04, metallic: 1 },
  { id: 'mat-copper', name: 'Copper', color: [0.96, 0.64, 0.54], roughness: 0.28, metallic: 1 },
  { id: 'mat-brass', name: 'Brass', color: [0.89, 0.76, 0.42], roughness: 0.35, metallic: 1 },
  { id: 'mat-iron', name: 'Iron', color: [0.56, 0.57, 0.58], roughness: 0.5, metallic: 1 },
  { id: 'mat-steel-brushed', name: 'Brushed Steel', color: [0.68, 0.69, 0.71], roughness: 0.42, metallic: 1 },
  { id: 'mat-rust', name: 'Rust', color: [0.47, 0.22, 0.1], roughness: 0.9, metallic: 0.1 },
  { id: 'mat-plastic-white', name: 'White Plastic', color: [0.92, 0.92, 0.9], roughness: 0.35, metallic: 0 },
  { id: 'mat-plastic-black', name: 'Black Plastic', color: [0.06, 0.06, 0.07], roughness: 0.3, metallic: 0 },
  { id: 'mat-rubber', name: 'Rubber', color: [0.09, 0.09, 0.09], roughness: 0.92, metallic: 0 },
  { id: 'mat-car-red', name: 'Red Paint', color: [0.72, 0.05, 0.06], roughness: 0.16, metallic: 0 },
  { id: 'mat-car-blue', name: 'Blue Paint', color: [0.07, 0.22, 0.62], roughness: 0.16, metallic: 0 },
  { id: 'mat-military', name: 'Olive Drab', color: [0.33, 0.36, 0.22], roughness: 0.7, metallic: 0 },
  { id: 'mat-hazard', name: 'Hazard Yellow', color: [0.96, 0.74, 0.07], roughness: 0.45, metallic: 0 },
  { id: 'mat-ceramic', name: 'Ceramic', color: [0.93, 0.91, 0.86], roughness: 0.08, metallic: 0 },
  { id: 'mat-wood', name: 'Wood', color: [0.45, 0.29, 0.16], roughness: 0.65, metallic: 0 },
  { id: 'mat-leather', name: 'Leather', color: [0.28, 0.15, 0.09], roughness: 0.55, metallic: 0 },
  { id: 'mat-concrete', name: 'Concrete', color: [0.55, 0.54, 0.52], roughness: 0.95, metallic: 0 },
  { id: 'mat-skin', name: 'Clay', color: [0.76, 0.5, 0.4], roughness: 0.6, metallic: 0 },
  {
    id: 'mat-neon',
    name: 'Neon',
    color: [0.05, 0.05, 0.06],
    roughness: 0.4,
    metallic: 0,
    emissive: [0.1, 0.95, 0.85],
  },
  {
    id: 'mat-lava',
    name: 'Ember',
    color: [0.08, 0.03, 0.02],
    roughness: 0.8,
    metallic: 0,
    emissive: [1.0, 0.35, 0.05],
  },
]

export interface BrushPreset {
  id: string
  name: string
  settings: Partial<BrushSettings>
}

/** Presets replace tip and dynamics but keep the current size. */
const RESET: Partial<BrushSettings> = {
  flow: 1,
  opacity: 1,
  angle: 0,
  sizeJitter: 0,
  angleJitter: 0,
  flowJitter: 0,
  scatter: 0,
  followStroke: false,
  pressureSize: true,
  pressureFlow: false,
  tipId: 'round',
}

export const BRUSH_PRESETS: BrushPreset[] = [
  { id: 'brush-hard', name: 'Hard Round', settings: { ...RESET, hardness: 0.92, spacing: 0.06 } },
  { id: 'brush-soft', name: 'Soft Round', settings: { ...RESET, hardness: 0.1, spacing: 0.06 } },
  {
    id: 'brush-airbrush',
    name: 'Airbrush',
    settings: { ...RESET, hardness: 0, spacing: 0.05, flow: 0.08, pressureSize: false, pressureFlow: true },
  },
  {
    id: 'brush-ink',
    name: 'Ink Pen',
    settings: { ...RESET, hardness: 0.95, spacing: 0.03, pressureSize: true },
  },
  {
    id: 'brush-chalk',
    name: 'Chalk',
    settings: { ...RESET, tipId: 'alpha-chalk', spacing: 0.1, angleJitter: 1, flow: 0.7 },
  },
  {
    id: 'brush-bristle',
    name: 'Dry Bristle',
    settings: { ...RESET, tipId: 'alpha-bristle', spacing: 0.04, followStroke: true, flow: 0.6 },
  },
  {
    id: 'brush-spray',
    name: 'Spray',
    settings: { ...RESET, tipId: 'alpha-spray', spacing: 0.12, angleJitter: 1, flow: 0.35, pressureSize: false },
  },
  {
    id: 'brush-splatter',
    name: 'Splatter',
    settings: {
      ...RESET,
      tipId: 'alpha-splatter',
      spacing: 0.7,
      angleJitter: 1,
      sizeJitter: 0.6,
      scatter: 0.5,
      pressureSize: false,
    },
  },
  {
    id: 'brush-scratches',
    name: 'Scratches',
    settings: { ...RESET, tipId: 'alpha-scratches', spacing: 0.35, followStroke: true, sizeJitter: 0.3 },
  },
  {
    id: 'brush-grunge',
    name: 'Grunge',
    settings: { ...RESET, tipId: 'alpha-grunge', spacing: 0.3, angleJitter: 1, flow: 0.5, sizeJitter: 0.25 },
  },
  {
    id: 'brush-calligraphy',
    name: 'Calligraphy',
    settings: { ...RESET, tipId: 'alpha-flat', spacing: 0.02, angle: 40, pressureSize: false },
  },
  {
    id: 'brush-stipple',
    name: 'Stipple',
    settings: { ...RESET, tipId: 'alpha-dots', spacing: 0.5, angleJitter: 1, scatter: 0.3 },
  },
]

/**
 * Renders a small shaded sphere as a material thumbnail.
 * A crude analytic preview (one key light, sky/ground ambient) is plenty here.
 */
export function renderMaterialThumbnail(preset: MaterialPreset, size = 72): string {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const image = ctx.createImageData(size, size)
  const base = preset.color.map(srgbToLinear)
  const emissive = (preset.emissive ?? [0, 0, 0]).map(srgbToLinear)
  const lx = -0.45, ly = 0.6, lz = 0.66
  const rough = clamp(preset.roughness, 0.04, 1)
  const shininess = 2 / (rough * rough * rough * rough) - 2

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = ((x + 0.5) / size) * 2 - 1
      const ny = 1 - ((y + 0.5) / size) * 2
      const r2 = (nx * nx + ny * ny) / 0.88
      const o = (y * size + x) * 4
      if (r2 > 1) continue
      const sx = nx / Math.sqrt(0.88), sy = ny / Math.sqrt(0.88)
      const nz = Math.sqrt(1 - sx * sx - sy * sy)
      const diffuse = Math.max(0, sx * lx + sy * ly + nz * lz)
      // Blinn-Phong half vector with the viewer along +z.
      const hx = lx, hy = ly, hz = lz + 1
      const hl = Math.hypot(hx, hy, hz)
      const nh = Math.max(0, (sx * hx + sy * hy + nz * hz) / hl)
      const specular = Math.pow(nh, shininess) * (shininess + 8) / 25
      const fresnel = Math.pow(1 - nz, 4)
      const ambient = 0.28 + 0.32 * (sy * 0.5 + 0.5)
      // Metals reflect a fake horizon so they don't look like dark plastic.
      const horizon = 0.35 + 0.65 * Math.pow(1 - Math.abs(sy * 0.8 + nz * 0.3 - 0.35), 3)
      for (let c = 0; c < 3; c++) {
        const dielectric = base[c] * (diffuse * 0.9 + ambient) + 0.04 * specular + fresnel * 0.12 * (1 - rough)
        const metal = base[c] * (specular * 0.9 + horizon * (1.05 - rough * 0.6) + fresnel * 0.3)
        const lit = dielectric * (1 - preset.metallic) + metal * preset.metallic + emissive[c] * 1.4
        image.data[o + c] = Math.round(clamp(linearToSrgb(lit / (1 + lit * 0.25)), 0, 1) * 255)
      }
      // Anti-aliased silhouette.
      image.data[o + 3] = Math.round(clamp((1 - Math.sqrt(r2)) * size * 0.5, 0, 1) * 255)
    }
  }
  ctx.putImageData(image, 0, 0)
  return canvas.toDataURL()
}
