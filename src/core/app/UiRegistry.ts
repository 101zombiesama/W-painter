import type { ComponentType } from 'react'
import { createStore, type StoreApi } from 'zustand/vanilla'

/** Icon components (lucide-compatible). */
export type IconComponent = ComponentType<{ size?: number | string; className?: string }>

/** A tabbed panel docked in one of the side columns. */
export interface PanelContribution {
  id: string
  title: string
  icon: IconComponent
  slot: 'left' | 'right'
  order: number
  component: ComponentType
}

/** A tab in the bottom asset shelf. */
export interface ShelfTabContribution {
  id: string
  title: string
  order: number
  component: ComponentType
}

/** An entry in one of the top bar menus. */
export interface MenuItemContribution {
  id: string
  menu: 'file' | 'edit' | 'view'
  label: string
  shortcut?: string
  order: number
  /** Items with different sections are separated by a divider. */
  section?: string
  run(): void
}

/**
 * A free-form widget rendered in one of the shell's component slots:
 *  - `rail`      the vertical tool strip on the far left
 *  - `topbar`    the right side of the top bar
 *  - `statusbar` the right side of the status bar
 *  - `viewport`  layered over the 3D view (hints, HUDs)
 *  - `overlay`   mounted at the app root (dialogs, drop zones)
 */
export interface WidgetContribution {
  id: string
  slot: 'rail' | 'topbar' | 'statusbar' | 'viewport' | 'overlay'
  order: number
  component: ComponentType
}

export interface UiRegistryState {
  panels: PanelContribution[]
  shelfTabs: ShelfTabContribution[]
  menuItems: MenuItemContribution[]
  widgets: WidgetContribution[]
}

function insert<T extends { id: string; order: number }>(list: T[], item: T): T[] {
  const next = list.filter((entry) => entry.id !== item.id)
  next.push(item)
  next.sort((a, b) => a.order - b.order)
  return next
}

/**
 * Extension points for the app shell. Features register UI contributions here
 * during setup; layout components render whatever is registered, so adding a
 * panel or a menu entry never requires touching the shell.
 */
export class UiRegistry {
  readonly store: StoreApi<UiRegistryState> = createStore<UiRegistryState>(() => ({
    panels: [],
    shelfTabs: [],
    menuItems: [],
    widgets: [],
  }))

  registerPanel(panel: PanelContribution): void {
    this.store.setState((s) => ({ panels: insert(s.panels, panel) }))
  }

  registerShelfTab(tab: ShelfTabContribution): void {
    this.store.setState((s) => ({ shelfTabs: insert(s.shelfTabs, tab) }))
  }

  registerMenuItem(item: MenuItemContribution): void {
    this.store.setState((s) => ({ menuItems: insert(s.menuItems, item) }))
  }

  registerWidget(widget: WidgetContribution): void {
    this.store.setState((s) => ({ widgets: insert(s.widgets, widget) }))
  }
}
