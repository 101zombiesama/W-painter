import { defineFeature } from '@/core/app/feature'
import { ShortcutService } from './ShortcutService'
import { ShortcutsDialog } from './ui/ShortcutsDialog'

declare module '@/core/app/services' {
  interface ServiceMap {
    shortcuts: ShortcutService
  }
}

/**
 * Global keyboard shortcuts. Listed first in the feature order so that every
 * other feature can register its own bindings during setup.
 */
export const shortcutsFeature = defineFeature({
  id: 'shortcuts',
  setup(ctx) {
    const shortcuts = new ShortcutService()
    ctx.services.register('shortcuts', shortcuts)

    ctx.ui.registerWidget({ id: 'shortcuts-dialog', slot: 'overlay', order: 30, component: ShortcutsDialog })
    ctx.ui.registerMenuItem({
      id: 'view.shortcuts',
      menu: 'view',
      label: 'Keyboard & Mouse…',
      shortcut: '?',
      order: 90,
      section: 'help',
      run: () => shortcuts.setHelpOpen(true),
    })
    shortcuts.register({
      id: 'help.shortcuts',
      keys: 'shift+?',
      label: 'Show keyboard & mouse help',
      group: 'View',
      run: () => shortcuts.setHelpOpen(!shortcuts.store.getState().helpOpen),
    })
    return shortcuts
  },
})

export { formatKeys } from './ShortcutService'
export type { Shortcut, ShortcutService } from './ShortcutService'
