import { useStore } from 'zustand'
import { useService } from '@/core/app/react'

/** Render statistics for the status bar. Frames are drawn on demand, so an idle view reports "idle". */
export function ViewportStats() {
  const viewport = useService('viewport')
  const stats = useStore(viewport.stats)
  const triangles =
    stats.triangles >= 1_000_000
      ? `${(stats.triangles / 1_000_000).toFixed(2)}M`
      : stats.triangles >= 1_000
        ? `${(stats.triangles / 1_000).toFixed(1)}k`
        : String(stats.triangles)
  return (
    <span className="font-mono tabular-nums" title="Frames are only drawn when something changes">
      {triangles} tris · {stats.fps > 0 ? `${stats.frameMs.toFixed(1)} ms · ${stats.fps} fps` : 'idle'}
    </span>
  )
}
