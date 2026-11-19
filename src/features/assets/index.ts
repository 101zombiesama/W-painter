import { defineFeature } from '@/core/app/feature'
import { AssetService } from './AssetService'
import { AlphasTab, BrushesTab, MaterialsTab, StampsTab } from './ui/ShelfTabs'

declare module '@/core/app/services' {
  interface ServiceMap {
    assets: AssetService
  }
}

/** The shelf: brush presets, alphas, stamps and material presets. */
export const assetsFeature = defineFeature({
  id: 'assets',
  setup(ctx) {
    const assets = new AssetService()
    ctx.services.register('assets', assets)
    // The paint engine asks this service for tip textures by asset id.
    ctx.services.get('paint').engine.setTipProvider(assets)

    ctx.ui.registerShelfTab({ id: 'materials', title: 'Materials', order: 10, component: MaterialsTab })
    ctx.ui.registerShelfTab({ id: 'brushes', title: 'Brushes', order: 20, component: BrushesTab })
    ctx.ui.registerShelfTab({ id: 'alphas', title: 'Alphas', order: 30, component: AlphasTab })
    ctx.ui.registerShelfTab({ id: 'stamps', title: 'Stamps', order: 40, component: StampsTab })
    return assets
  },
})

export type { AssetService } from './AssetService'
