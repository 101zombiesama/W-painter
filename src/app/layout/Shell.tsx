import { ChevronDown, ChevronUp } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useUi } from '@/core/app/react'
import type { WidgetContribution } from '@/core/app/UiRegistry'
import { cx } from '@/shared/ui/cx'
import { Menu, type MenuEntry } from '@/shared/ui/Menu'

/** Renders every widget registered for a slot, in order. */
export function WidgetSlot({ slot }: { slot: WidgetContribution['slot'] }) {
  const widgets = useUi((state) => state.widgets)
  return (
    <>
      {widgets
        .filter((widget) => widget.slot === slot)
        .map(({ id, component: Component }) => (
          <Component key={id} />
        ))}
    </>
  )
}

const MENUS = [
  { id: 'file', label: 'File' },
  { id: 'edit', label: 'Edit' },
  { id: 'view', label: 'View' },
] as const

export function TopBar() {
  const menuItems = useUi((state) => state.menuItems)
  const menus = useMemo(
    () =>
      MENUS.map((menu) => ({
        ...menu,
        entries: menuItems
          .filter((item) => item.menu === menu.id)
          .map<MenuEntry>((item) => ({
            id: item.id,
            label: item.label,
            shortcut: item.shortcut,
            section: item.section,
            run: item.run,
          })),
      })).filter((menu) => menu.entries.length > 0),
    [menuItems],
  )

  return (
    <header className="flex h-11 shrink-0 items-center gap-1 border-b border-line bg-panel px-2">
      <div className="mr-2 flex items-center gap-2 pl-1">
        <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-6 w-6" />
        <span className="text-[13px] font-semibold tracking-tight">W-Painter</span>
      </div>
      {menus.map((menu) => (
        <Menu key={menu.id} label={menu.label} entries={menu.entries} />
      ))}
      <div className="flex-1" />
      <div className="flex items-center gap-1.5">
        <WidgetSlot slot="topbar" />
      </div>
    </header>
  )
}

export function Rail() {
  return (
    <nav
      aria-label="Tools"
      className="flex w-11 shrink-0 flex-col items-center gap-1 border-r border-line bg-panel py-2"
    >
      <WidgetSlot slot="rail" />
    </nav>
  )
}

/** A side column showing the panels registered for its slot as tabs. */
export function SidePanel({ slot, width }: { slot: 'left' | 'right'; width: number }) {
  const allPanels = useUi((state) => state.panels)
  const panels = useMemo(() => allPanels.filter((panel) => panel.slot === slot), [allPanels, slot])
  const [activeId, setActiveId] = useState<string | null>(null)
  const active = panels.find((panel) => panel.id === activeId) ?? panels[0]
  if (!active) return null
  const ActivePanel = active.component

  return (
    <aside
      className={cx('flex shrink-0 flex-col bg-panel', slot === 'left' ? 'border-r border-line' : 'border-l border-line')}
      style={{ width }}
    >
      <div role="tablist" className="flex h-9 shrink-0 items-stretch border-b border-line px-1">
        {panels.map(({ id, title, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={id === active.id}
            onClick={() => setActiveId(id)}
            className={cx(
              'relative flex items-center gap-1.5 px-2.5 text-[12px] font-medium transition-colors',
              id === active.id ? 'text-fg' : 'text-fg-faint hover:text-fg-dim',
            )}
          >
            <Icon size={14} />
            {title}
            {id === active.id && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-accent" />}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        <ActivePanel />
      </div>
    </aside>
  )
}

/** The asset shelf under the viewport. */
export function Shelf() {
  const tabs = useUi((state) => state.shelfTabs)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const active = tabs.find((tab) => tab.id === activeId) ?? tabs[0]
  if (!active) return null
  const ActiveTab = active.component

  return (
    <section aria-label="Assets" className="flex shrink-0 flex-col border-t border-line bg-panel">
      <div className="flex h-8 shrink-0 items-stretch px-1">
        <div role="tablist" className="flex items-stretch">
          {tabs.map(({ id, title }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={id === active.id}
              onClick={() => {
                setActiveId(id)
                setCollapsed(false)
              }}
              className={cx(
                'relative px-3 text-[12px] font-medium transition-colors',
                id === active.id && !collapsed ? 'text-fg' : 'text-fg-faint hover:text-fg-dim',
              )}
            >
              {title}
              {id === active.id && !collapsed && (
                <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-accent" />
              )}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <button
          type="button"
          aria-label={collapsed ? 'Expand shelf' : 'Collapse shelf'}
          title={collapsed ? 'Expand shelf' : 'Collapse shelf'}
          onClick={() => setCollapsed(!collapsed)}
          className="flex w-8 items-center justify-center text-fg-faint hover:text-fg"
        >
          {collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>
      {!collapsed && (
        <div className="h-[118px] overflow-x-hidden overflow-y-auto border-t border-line">
          <ActiveTab />
        </div>
      )}
    </section>
  )
}

export function StatusBar() {
  return (
    <footer className="flex h-6 shrink-0 items-center justify-between gap-4 border-t border-line bg-panel px-3 text-[11px] text-fg-faint">
      <span className="truncate">
        Drag on the model to paint · Alt-drag or right-drag to orbit · Middle-drag to pan · Scroll to zoom · [ ] brush size
      </span>
      <div className="flex shrink-0 items-center gap-4">
        <WidgetSlot slot="statusbar" />
      </div>
    </footer>
  )
}
