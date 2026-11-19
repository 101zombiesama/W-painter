import { useEffect, useRef } from 'react'
import type { TextureSet } from '../TextureSet'

/** Above this many triangles only a subset of edges is drawn. */
const MAX_DRAWN_TRIANGLES = 60_000

/** Draws a texture set's UV layout as a wireframe. */
export function UvPreview({ textureSet }: { textureSet: TextureSet }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const size = Math.round(canvas.clientWidth * dpr)
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, size, size)

    const uv = textureSet.geometry.getAttribute('uv')
    const index = textureSet.geometry.getIndex()
    if (!uv) return
    const triangles = (index ? index.count : uv.count) / 3
    const stride = Math.max(1, Math.ceil(triangles / MAX_DRAWN_TRIANGLES))

    ctx.lineWidth = Math.max(1, dpr * 0.6)
    ctx.strokeStyle = 'rgba(153, 165, 255, 0.55)'
    ctx.fillStyle = 'rgba(124, 140, 255, 0.10)'
    ctx.beginPath()
    for (let t = 0; t < triangles; t += stride) {
      const a = index ? index.getX(t * 3) : t * 3
      const b = index ? index.getX(t * 3 + 1) : t * 3 + 1
      const c = index ? index.getX(t * 3 + 2) : t * 3 + 2
      // Canvas y grows downward; UV v grows upward.
      ctx.moveTo(uv.getX(a) * size, (1 - uv.getY(a)) * size)
      ctx.lineTo(uv.getX(b) * size, (1 - uv.getY(b)) * size)
      ctx.lineTo(uv.getX(c) * size, (1 - uv.getY(c)) * size)
      ctx.closePath()
    }
    ctx.fill()
    ctx.stroke()
  }, [textureSet])

  return (
    <canvas
      ref={canvasRef}
      aria-label="UV layout"
      className="checkerboard aspect-square w-full rounded-md border border-line"
    />
  )
}
