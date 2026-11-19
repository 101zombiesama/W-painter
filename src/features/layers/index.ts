import { Layers } from 'lucide-react'
import { defineFeature } from '@/core/app/feature'
import { LayerService } from './LayerService'
import { LayersPanel } from './ui/LayersPanel'

declare module '@/core/app/services' {
  interface ServiceMap {
    layers: LayerService
  }
}

/** Layer stacks, masks, blend modes and the GPU compositor that flattens them. */
export const layersFeature = defineFeature({
  id: 'layers',
  setup(ctx) {
    const layers = new LayerService(ctx)
    ctx.services.register('layers', layers)
    ctx.ui.registerPanel({
      id: 'layers',
      title: 'Layers',
      icon: Layers,
      slot: 'right',
      order: 10,
      component: LayersPanel,
    })
    return layers
  },
})

export type { LayerService } from './LayerService'
export type { LayerData, LayerStack, StrokeDescriptor } from './types'
