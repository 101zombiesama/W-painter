import { Sun } from 'lucide-react'
import { defineFeature } from '@/core/app/feature'
import { LightingService } from './LightingService'
import { LightingPanel } from './ui/LightingPanel'

declare module '@/core/app/services' {
  interface ServiceMap {
    lighting: LightingService
  }
}

/** Environment lighting, key light, exposure and tone mapping. */
export const lightingFeature = defineFeature({
  id: 'lighting',
  setup(ctx) {
    const lighting = new LightingService(ctx)
    ctx.services.register('lighting', lighting)
    ctx.ui.registerPanel({
      id: 'lighting',
      title: 'Lighting',
      icon: Sun,
      slot: 'right',
      order: 30,
      component: LightingPanel,
    })
    return lighting
  },
})

export type { LightingService } from './LightingService'
