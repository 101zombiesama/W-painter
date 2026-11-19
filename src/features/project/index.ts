import { Grid3x3 } from 'lucide-react'
import { defineFeature } from '@/core/app/feature'
import { ProjectService } from './ProjectService'
import { TextureSetsPanel } from './ui/TextureSetsPanel'
import { VIEW_MODES, ViewModeSelect } from './ui/ViewModeSelect'

declare module '@/core/app/services' {
  interface ServiceMap {
    project: ProjectService
  }
}

declare module '@/core/events/EventBus' {
  interface AppEvents {
    /** The user asked for a fresh UV atlas; handled by the model feature. */
    'project:regenerateUVsRequested': undefined
  }
}

/** The open document: texture sets, their resolution and how they are displayed. */
export const projectFeature = defineFeature({
  id: 'project',
  setup(ctx) {
    const project = new ProjectService(ctx)
    ctx.services.register('project', project)

    ctx.ui.registerPanel({
      id: 'texture-sets',
      title: 'Texture Sets',
      icon: Grid3x3,
      slot: 'right',
      order: 20,
      component: TextureSetsPanel,
    })
    ctx.ui.registerWidget({ id: 'view-mode', slot: 'topbar', order: 10, component: ViewModeSelect })

    const shortcuts = ctx.services.get('shortcuts')
    shortcuts.register({
      id: 'view.frame',
      keys: 'f',
      label: 'Frame model',
      group: 'View',
      run: () => project.frameAll(),
    })
    shortcuts.register({
      id: 'view.cycle',
      keys: 'c',
      label: 'Next channel view',
      group: 'View',
      run: () => {
        const current = VIEW_MODES.findIndex((mode) => mode.value === project.store.getState().viewMode)
        project.setViewMode(VIEW_MODES[(current + 1) % VIEW_MODES.length].value)
      },
    })
    shortcuts.register({
      id: 'view.material',
      keys: 'm',
      label: 'Material view',
      group: 'View',
      run: () => project.setViewMode('material'),
    })
    ctx.ui.registerMenuItem({
      id: 'view.frame',
      menu: 'view',
      label: 'Frame Model',
      shortcut: 'F',
      order: 10,
      section: 'camera',
      run: () => project.frameAll(),
    })

    return project
  },
})

export type { ProjectService } from './ProjectService'
