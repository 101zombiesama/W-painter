import { CanvasTexture, ClampToEdgeWrapping, LinearFilter, LinearMipmapLinearFilter, NoColorSpace } from 'three'
import { createStore, type StoreApi } from 'zustand/vanilla'
import { createId } from '@/core/utils/id'
import type { BrushTip, BrushTipProvider } from '@/features/paint/tips'
import { ALPHA_GENERATORS, renderToCanvas, STAMP_GENERATORS } from './generators'

export type ImageAssetKind = 'alpha' | 'stamp'

export interface ImageAsset {
  id: string
  name: string
  kind: ImageAssetKind
  /** Data URL for the shelf. */
  thumbnail: string
  /** True when the image carries its own colors (a decal) rather than just coverage. */
  tinted: boolean
  builtin: boolean
}

export interface AssetState {
  alphas: ImageAsset[]
  stamps: ImageAsset[]
}

const TIP_SIZE = 256
const IMPORT_SIZE = 512
const THUMBNAIL_SIZE = 64

/**
 * The library of brush tips and stamps. Built-in assets are generated
 * procedurally; users can import their own images. GPU textures are created
 * lazily the first time an asset is used in a stroke.
 */
export class AssetService implements BrushTipProvider {
  readonly store: StoreApi<AssetState> = createStore<AssetState>(() => ({ alphas: [], stamps: [] }))

  private readonly canvases = new Map<string, HTMLCanvasElement>()
  private readonly tinted = new Map<string, boolean>()
  private readonly tips = new Map<string, BrushTip>()

  constructor() {
    const alphas = ALPHA_GENERATORS.map((g) =>
      this.register(g.id, g.name, 'alpha', renderToCanvas(g.paint, TIP_SIZE), false, true),
    )
    const stamps = STAMP_GENERATORS.map((g) =>
      this.register(g.id, g.name, 'stamp', renderToCanvas(g.paint, TIP_SIZE), false, true),
    )
    this.store.setState({ alphas, stamps })
  }

  getTip(id: string): BrushTip | null {
    const cached = this.tips.get(id)
    if (cached) return cached
    const canvas = this.canvases.get(id)
    if (!canvas) return null

    const tinted = this.tinted.get(id) ?? false
    const texture = new CanvasTexture(canvas)
    texture.colorSpace = NoColorSpace
    texture.wrapS = texture.wrapT = ClampToEdgeWrapping
    texture.minFilter = LinearMipmapLinearFilter
    texture.magFilter = LinearFilter
    texture.generateMipmaps = true
    // Premultiplied color filters without dark fringes; plain alphas only use `a`.
    texture.premultiplyAlpha = tinted
    texture.needsUpdate = true

    const tip: BrushTip = { texture, size: canvas.width, tinted }
    this.tips.set(id, tip)
    return tip
  }

  describe(id: string): { name: string; thumbnail: string } | null {
    const { alphas, stamps } = this.store.getState()
    const asset = alphas.find((a) => a.id === id) ?? stamps.find((a) => a.id === id)
    return asset ? { name: asset.name, thumbnail: asset.thumbnail } : null
  }

  /** Adds a user image to the library and returns its asset id. */
  async importImage(file: File, kind: ImageAssetKind): Promise<string> {
    const bitmap = await createImageBitmap(file)
    const size = Math.min(IMPORT_SIZE, nextPowerOfTwo(Math.max(bitmap.width, bitmap.height)))
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    // Fit inside the square, centered, preserving aspect ratio.
    const scale = Math.min(size / bitmap.width, size / bitmap.height)
    const w = bitmap.width * scale
    const h = bitmap.height * scale
    ctx.drawImage(bitmap, (size - w) / 2, (size - h) / 2, w, h)
    bitmap.close()

    const tinted = normalizeImportedImage(ctx, size, kind)
    const id = createId(kind)
    const name = file.name.replace(/\.[^.]+$/, '')
    const asset = this.register(id, name, kind, canvas, tinted, false)
    this.store.setState((state) =>
      kind === 'alpha' ? { alphas: [...state.alphas, asset] } : { stamps: [...state.stamps, asset] },
    )
    return id
  }

  dispose(): void {
    for (const tip of this.tips.values()) tip.texture.dispose()
    this.tips.clear()
  }

  private register(
    id: string,
    name: string,
    kind: ImageAssetKind,
    canvas: HTMLCanvasElement,
    tinted: boolean,
    builtin: boolean,
  ): ImageAsset {
    this.canvases.set(id, canvas)
    this.tinted.set(id, tinted)
    return { id, name, kind, thumbnail: makeThumbnail(canvas), tinted, builtin }
  }
}

function makeThumbnail(source: HTMLCanvasElement): string {
  const canvas = document.createElement('canvas')
  canvas.width = THUMBNAIL_SIZE
  canvas.height = THUMBNAIL_SIZE
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, THUMBNAIL_SIZE, THUMBNAIL_SIZE)
  return canvas.toDataURL()
}

/**
 * Converts an arbitrary image into the tip format (rgb = tint, a = coverage).
 *  - Images with transparency keep their alpha.
 *  - Opaque grayscale images are treated as height/alpha maps: brightness becomes coverage.
 *  - Colored stamps keep their colors (returned as "tinted").
 */
function normalizeImportedImage(ctx: CanvasRenderingContext2D, size: number, kind: ImageAssetKind): boolean {
  const image = ctx.getImageData(0, 0, size, size)
  const data = image.data
  let hasTransparency = false
  let hasColor = false
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 250) hasTransparency = true
    if (data[i + 3] > 8) {
      const max = Math.max(data[i], data[i + 1], data[i + 2])
      const min = Math.min(data[i], data[i + 1], data[i + 2])
      if (max - min > 24) hasColor = true
    }
  }

  const tinted = kind === 'stamp' && hasColor
  if (tinted && hasTransparency) return true

  for (let i = 0; i < data.length; i += 4) {
    const luminance = (data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722) | 0
    if (tinted) {
      data[i + 3] = 255
    } else {
      data[i + 3] = hasTransparency ? data[i + 3] : luminance
      data[i] = data[i + 1] = data[i + 2] = 255
    }
  }
  ctx.putImageData(image, 0, 0)
  return tinted
}

function nextPowerOfTwo(value: number): number {
  let p = 1
  while (p < value) p *= 2
  return p
}
