import { createRandom } from '@/core/utils/math'

/**
 * Procedural brush tips and stamps, drawn with Canvas 2D at startup.
 * White pixels with alpha = coverage. No image files to download or license.
 */
export type Painter = (ctx: CanvasRenderingContext2D, size: number) => void

export interface GeneratedAsset {
  id: string
  name: string
  paint: Painter
}

export function renderToCanvas(paint: Painter, size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.strokeStyle = '#fff'
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  paint(ctx, size)
  return canvas
}

function softDot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, alpha = 1, hardness = 0): void {
  const gradient = ctx.createRadialGradient(x, y, r * hardness, x, y, r)
  gradient.addColorStop(0, `rgba(255,255,255,${alpha})`)
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#fff'
}

function polygon(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, sides: number, rotation = 0): void {
  ctx.beginPath()
  for (let i = 0; i < sides; i++) {
    const a = rotation + (i / sides) * Math.PI * 2
    const x = cx + Math.cos(a) * r
    const y = cy + Math.sin(a) * r
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
}

function star(ctx: CanvasRenderingContext2D, cx: number, cy: number, outer: number, inner: number, points: number): void {
  ctx.beginPath()
  for (let i = 0; i < points * 2; i++) {
    const a = -Math.PI / 2 + (i / (points * 2)) * Math.PI * 2
    const r = i % 2 === 0 ? outer : inner
    const x = cx + Math.cos(a) * r
    const y = cy + Math.sin(a) * r
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
}

/** Keeps a tip from having visible square corners when it is noisy. */
function fadeToCircle(ctx: CanvasRenderingContext2D, s: number, start = 0.7): void {
  ctx.globalCompositeOperation = 'destination-in'
  const gradient = ctx.createRadialGradient(s / 2, s / 2, (s / 2) * start, s / 2, s / 2, s / 2)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, s, s)
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = '#fff'
}

// --- brush tips (alphas) ----------------------------------------------------

export const ALPHA_GENERATORS: GeneratedAsset[] = [
  {
    id: 'alpha-square',
    name: 'Square',
    paint: (ctx, s) => ctx.fillRect(s * 0.04, s * 0.04, s * 0.92, s * 0.92),
  },
  {
    id: 'alpha-flat',
    name: 'Flat',
    paint: (ctx, s) => {
      ctx.beginPath()
      ctx.ellipse(s / 2, s / 2, s * 0.47, s * 0.13, 0, 0, Math.PI * 2)
      ctx.fill()
    },
  },
  {
    id: 'alpha-chalk',
    name: 'Chalk',
    paint: (ctx, s) => {
      const random = createRandom(11)
      for (let i = 0; i < 2600; i++) {
        const a = random() * Math.PI * 2
        const r = Math.sqrt(random()) * s * 0.46
        ctx.globalAlpha = 0.15 + random() * 0.6
        const d = 1 + random() * s * 0.018
        ctx.fillRect(s / 2 + Math.cos(a) * r, s / 2 + Math.sin(a) * r, d, d)
      }
      ctx.globalAlpha = 1
      fadeToCircle(ctx, s, 0.75)
    },
  },
  {
    id: 'alpha-bristle',
    name: 'Bristle',
    paint: (ctx, s) => {
      const random = createRandom(23)
      for (let i = 0; i < 70; i++) {
        const a = random() * Math.PI * 2
        const r = Math.sqrt(random()) * s * 0.4
        softDot(ctx, s / 2 + Math.cos(a) * r, s / 2 + Math.sin(a) * r, s * (0.015 + random() * 0.035), 0.9, 0.4)
      }
    },
  },
  {
    id: 'alpha-splatter',
    name: 'Splatter',
    paint: (ctx, s) => {
      const random = createRandom(5)
      softDot(ctx, s / 2, s / 2, s * 0.16, 1, 0.75)
      for (let i = 0; i < 90; i++) {
        const a = random() * Math.PI * 2
        const r = (0.1 + Math.pow(random(), 1.6) * 0.36) * s
        softDot(ctx, s / 2 + Math.cos(a) * r, s / 2 + Math.sin(a) * r, s * (0.006 + Math.pow(random(), 3) * 0.06), 1, 0.7)
      }
    },
  },
  {
    id: 'alpha-spray',
    name: 'Spray',
    paint: (ctx, s) => {
      const random = createRandom(42)
      for (let i = 0; i < 1400; i++) {
        const a = random() * Math.PI * 2
        const r = Math.pow(random(), 0.8) * s * 0.47
        ctx.globalAlpha = (1 - r / (s * 0.47)) * 0.8 + 0.1
        ctx.beginPath()
        ctx.arc(s / 2 + Math.cos(a) * r, s / 2 + Math.sin(a) * r, 0.6 + random() * 1.4, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
    },
  },
  {
    id: 'alpha-scratches',
    name: 'Scratches',
    paint: (ctx, s) => {
      const random = createRandom(77)
      for (let i = 0; i < 38; i++) {
        const y = s * (0.12 + random() * 0.76)
        const x0 = s * (0.05 + random() * 0.3)
        const x1 = x0 + s * (0.2 + random() * 0.6)
        ctx.globalAlpha = 0.3 + random() * 0.7
        ctx.lineWidth = 0.6 + random() * 2.2
        ctx.beginPath()
        ctx.moveTo(x0, y)
        ctx.lineTo(Math.min(x1, s * 0.96), y + (random() - 0.5) * s * 0.08)
        ctx.stroke()
      }
      ctx.globalAlpha = 1
      fadeToCircle(ctx, s, 0.8)
    },
  },
  {
    id: 'alpha-grunge',
    name: 'Grunge',
    paint: (ctx, s) => {
      const random = createRandom(101)
      for (let i = 0; i < 260; i++) {
        softDot(ctx, random() * s, random() * s, s * (0.02 + random() * 0.09), 0.1 + random() * 0.35)
      }
      ctx.globalCompositeOperation = 'destination-out'
      for (let i = 0; i < 160; i++) {
        softDot(ctx, random() * s, random() * s, s * (0.01 + random() * 0.05), 0.5 + random() * 0.5, 0.3)
      }
      ctx.globalCompositeOperation = 'source-over'
      fadeToCircle(ctx, s, 0.55)
    },
  },
  {
    id: 'alpha-dots',
    name: 'Dots',
    paint: (ctx, s) => {
      const n = 5
      const cell = s / n
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          ctx.beginPath()
          ctx.arc((x + 0.5) * cell, (y + 0.5) * cell, cell * 0.3, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      fadeToCircle(ctx, s, 0.85)
    },
  },
  {
    id: 'alpha-crosshatch',
    name: 'Hatch',
    paint: (ctx, s) => {
      ctx.lineWidth = s * 0.02
      for (let i = -8; i <= 16; i++) {
        ctx.beginPath()
        ctx.moveTo(i * s * 0.09, 0)
        ctx.lineTo(i * s * 0.09 + s * 0.5, s)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(i * s * 0.09 + s * 0.5, 0)
        ctx.lineTo(i * s * 0.09, s)
        ctx.stroke()
      }
      fadeToCircle(ctx, s, 0.8)
    },
  },
  {
    id: 'alpha-star',
    name: 'Star',
    paint: (ctx, s) => {
      star(ctx, s / 2, s / 2, s * 0.47, s * 0.2, 5)
      ctx.fill()
    },
  },
  {
    id: 'alpha-leaf',
    name: 'Leaf',
    paint: (ctx, s) => {
      ctx.beginPath()
      ctx.moveTo(s * 0.5, s * 0.04)
      ctx.bezierCurveTo(s * 0.95, s * 0.3, s * 0.85, s * 0.8, s * 0.5, s * 0.96)
      ctx.bezierCurveTo(s * 0.15, s * 0.8, s * 0.05, s * 0.3, s * 0.5, s * 0.04)
      ctx.fill()
    },
  },
]

// --- stamps -----------------------------------------------------------------

export const STAMP_GENERATORS: GeneratedAsset[] = [
  {
    id: 'stamp-rivet',
    name: 'Rivet',
    paint: (ctx, s) => softDot(ctx, s / 2, s / 2, s * 0.46, 1, 0.55),
  },
  {
    id: 'stamp-bolt',
    name: 'Hex Bolt',
    paint: (ctx, s) => {
      ctx.globalAlpha = 0.55
      ctx.beginPath()
      ctx.arc(s / 2, s / 2, s * 0.47, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1
      polygon(ctx, s / 2, s / 2, s * 0.33, 6, Math.PI / 6)
      ctx.fill()
    },
  },
  {
    id: 'stamp-screw',
    name: 'Screw',
    paint: (ctx, s) => {
      ctx.beginPath()
      ctx.arc(s / 2, s / 2, s * 0.46, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalCompositeOperation = 'destination-out'
      ctx.fillRect(s * 0.14, s * 0.44, s * 0.72, s * 0.12)
      ctx.fillRect(s * 0.44, s * 0.14, s * 0.12, s * 0.72)
      ctx.globalCompositeOperation = 'source-over'
    },
  },
  {
    id: 'stamp-ring',
    name: 'Ring',
    paint: (ctx, s) => {
      ctx.lineWidth = s * 0.09
      ctx.beginPath()
      ctx.arc(s / 2, s / 2, s * 0.4, 0, Math.PI * 2)
      ctx.stroke()
    },
  },
  {
    id: 'stamp-vent',
    name: 'Vent',
    paint: (ctx, s) => {
      ctx.lineWidth = s * 0.08
      for (let i = 0; i < 5; i++) {
        const y = s * (0.18 + i * 0.16)
        ctx.beginPath()
        ctx.moveTo(s * 0.14, y)
        ctx.lineTo(s * 0.86, y)
        ctx.stroke()
      }
    },
  },
  {
    id: 'stamp-panel',
    name: 'Panel',
    paint: (ctx, s) => {
      ctx.lineWidth = s * 0.045
      ctx.beginPath()
      ctx.roundRect(s * 0.08, s * 0.08, s * 0.84, s * 0.84, s * 0.12)
      ctx.stroke()
    },
  },
  {
    id: 'stamp-plus',
    name: 'Plus',
    paint: (ctx, s) => {
      ctx.fillRect(s * 0.4, s * 0.08, s * 0.2, s * 0.84)
      ctx.fillRect(s * 0.08, s * 0.4, s * 0.84, s * 0.2)
    },
  },
  {
    id: 'stamp-hex',
    name: 'Hexagon',
    paint: (ctx, s) => {
      polygon(ctx, s / 2, s / 2, s * 0.46, 6)
      ctx.fill()
    },
  },
  {
    id: 'stamp-arrow',
    name: 'Arrow',
    paint: (ctx, s) => {
      ctx.beginPath()
      ctx.moveTo(s * 0.5, s * 0.06)
      ctx.lineTo(s * 0.9, s * 0.5)
      ctx.lineTo(s * 0.64, s * 0.5)
      ctx.lineTo(s * 0.64, s * 0.94)
      ctx.lineTo(s * 0.36, s * 0.94)
      ctx.lineTo(s * 0.36, s * 0.5)
      ctx.lineTo(s * 0.1, s * 0.5)
      ctx.closePath()
      ctx.fill()
    },
  },
  {
    id: 'stamp-chevrons',
    name: 'Chevrons',
    paint: (ctx, s) => {
      ctx.lineWidth = s * 0.1
      for (let i = 0; i < 3; i++) {
        const y = s * (0.3 + i * 0.25)
        ctx.beginPath()
        ctx.moveTo(s * 0.14, y)
        ctx.lineTo(s * 0.5, y - s * 0.2)
        ctx.lineTo(s * 0.86, y)
        ctx.stroke()
      }
    },
  },
  {
    id: 'stamp-warning',
    name: 'Warning',
    paint: (ctx, s) => {
      polygon(ctx, s / 2, s * 0.56, s * 0.48, 3, -Math.PI / 2)
      ctx.fill()
      ctx.globalCompositeOperation = 'destination-out'
      ctx.fillRect(s * 0.46, s * 0.34, s * 0.08, s * 0.26)
      ctx.beginPath()
      ctx.arc(s * 0.5, s * 0.69, s * 0.045, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalCompositeOperation = 'source-over'
    },
  },
  {
    id: 'stamp-tread',
    name: 'Tread Plate',
    paint: (ctx, s) => {
      const n = 4
      const cell = s / n
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          ctx.save()
          ctx.translate((x + 0.5) * cell, (y + 0.5) * cell)
          ctx.rotate(((x + y) % 2 === 0 ? 1 : -1) * (Math.PI / 4))
          ctx.beginPath()
          ctx.ellipse(0, 0, cell * 0.4, cell * 0.12, 0, 0, Math.PI * 2)
          ctx.fill()
          ctx.restore()
        }
      }
    },
  },
  {
    id: 'stamp-gear',
    name: 'Gear',
    paint: (ctx, s) => {
      const teeth = 10
      ctx.beginPath()
      for (let i = 0; i < teeth * 4; i++) {
        const a = (i / (teeth * 4)) * Math.PI * 2
        const r = i % 4 < 2 ? s * 0.47 : s * 0.37
        const x = s / 2 + Math.cos(a) * r
        const y = s / 2 + Math.sin(a) * r
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.closePath()
      ctx.fill()
      ctx.globalCompositeOperation = 'destination-out'
      ctx.beginPath()
      ctx.arc(s / 2, s / 2, s * 0.14, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalCompositeOperation = 'source-over'
    },
  },
  {
    id: 'stamp-star',
    name: 'Star',
    paint: (ctx, s) => {
      star(ctx, s / 2, s / 2, s * 0.47, s * 0.2, 5)
      ctx.fill()
    },
  },
]
