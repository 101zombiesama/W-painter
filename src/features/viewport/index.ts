import { defineFeature } from '@/core/app/feature'
import { ViewportStats } from './ui/ViewportStats'
import { ViewportService } from './ViewportService'

declare module '@/core/app/services' {
  interface ServiceMap {
    viewport: ViewportService
  }
}

/** The 3D view: renderer, camera, frame loop and pointer routing. */
export const viewportFeature = defineFeature({
  id: 'viewport',
  setup(ctx) {
    const viewport = new ViewportService()
    ctx.services.register('viewport', viewport)
    ctx.ui.registerWidget({ id: 'viewport-stats', slot: 'statusbar', order: 10, component: ViewportStats })
    return viewport
  },
})

export { ViewportHost } from './ui/ViewportHost'
export type { Gesture, GestureHandler, SurfaceHit, ViewportService } from './ViewportService'
