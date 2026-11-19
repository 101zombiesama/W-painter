import { Brush } from 'lucide-react'
import { defineFeature } from '@/core/app/feature'
import { PaintEngine } from './PaintEngine'
import { createPaintActions, createPaintStore, type PaintActions, type PaintStore } from './store'
import { PaintPanel } from './ui/PaintPanel'
import { ToolRail, TOOLS } from './ui/ToolRail'

export interface PaintService {
  /** Tool, brush and material state. */
  store: PaintStore
  actions: PaintActions
  engine: PaintEngine
}

declare module '@/core/app/services' {
  interface ServiceMap {
    paint: PaintService
  }
}

/** Brushes, eraser, stamps and the eyedropper: everything that edits pixels by hand. */
export const paintFeature = defineFeature({
  id: 'paint',
  setup(ctx) {
    const store = createPaintStore()
    const actions = createPaintActions(store)
    const engine = new PaintEngine(ctx, store, actions)
    ctx.services.register('paint', { store, actions, engine })

    ctx.ui.registerWidget({ id: 'paint-tools', slot: 'rail', order: 10, component: ToolRail })
    ctx.ui.registerPanel({
      id: 'paint',
      title: 'Tool',
      icon: Brush,
      slot: 'left',
      order: 10,
      component: PaintPanel,
    })

    const shortcuts = ctx.services.get('shortcuts')
    for (const tool of TOOLS) {
      shortcuts.register({
        id: `tool.${tool.id}`,
        keys: tool.key.toLowerCase(),
        label: tool.label,
        group: 'Tools',
        run: () => actions.setTool(tool.id),
      })
    }
    shortcuts.register({
      id: 'brush.smaller',
      keys: '[',
      label: 'Decrease brush size',
      group: 'Brush',
      repeat: true,
      run: () => actions.scaleBrushSize(1 / 1.12),
    })
    shortcuts.register({
      id: 'brush.larger',
      keys: ']',
      label: 'Increase brush size',
      group: 'Brush',
      repeat: true,
      run: () => actions.scaleBrushSize(1.12),
    })
    shortcuts.register({
      id: 'brush.symmetry',
      keys: 'l',
      label: 'Toggle symmetry',
      group: 'Brush',
      run: () => actions.setSymmetry({ enabled: !store.getState().symmetry.enabled }),
    })
    shortcuts.register({
      id: 'brush.swapMask',
      keys: 'x',
      label: 'Swap mask paint between white and black',
      group: 'Brush',
      run: () => actions.setMaskValue(store.getState().maskValue > 0.5 ? 0 : 1),
    })

    return engine
  },
})

export type { BrushTip, BrushTipProvider } from './tips'
