import { useEffect, useRef } from 'react'
import { useService } from '@/core/app/react'

/** Mounts the engine-owned canvas into the React layout. */
export function ViewportHost() {
  const viewport = useService('viewport')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = ref.current
    if (!container) return
    return viewport.mount(container)
  }, [viewport])

  return <div ref={ref} className="absolute inset-0 touch-none overflow-hidden" />
}
