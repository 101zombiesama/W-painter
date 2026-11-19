import { useMemo } from 'react'
import { useStore } from 'zustand'
import { useService } from '@/core/app/react'
import { Dialog } from '@/shared/ui/overlays'
import { formatKeys } from '../ShortcutService'

/** Mouse gestures are handled by the viewport, not the shortcut registry. */
const MOUSE_GESTURES: [string, string][] = [
  ['Drag on model', 'Paint with the active tool'],
  ['Drag on empty space', 'Orbit camera'],
  ['Alt + drag / Right-drag', 'Orbit camera'],
  ['Middle-drag / Alt + Shift + drag', 'Pan camera'],
  ['Scroll', 'Zoom toward cursor'],
  ['Shift + right-drag', 'Rotate environment lighting'],
]

export function ShortcutsDialog() {
  const service = useService('shortcuts')
  const open = useStore(service.store, (state) => state.helpOpen)
  const shortcuts = useStore(service.store, (state) => state.shortcuts)

  const groups = useMemo(() => {
    const map = new Map<string, { label: string; keys: string }[]>()
    for (const shortcut of shortcuts) {
      const list = map.get(shortcut.group) ?? []
      list.push({ label: shortcut.label, keys: formatKeys(shortcut.keys) })
      map.set(shortcut.group, list)
    }
    return [...map.entries()]
  }, [shortcuts])

  return (
    <Dialog open={open} title="Keyboard & mouse" onClose={() => service.setHelpOpen(false)} width={560}>
      <div className="grid grid-cols-2 gap-x-8 gap-y-5">
        <ShortcutGroup title="Mouse" rows={MOUSE_GESTURES.map(([keys, label]) => ({ keys, label }))} wide />
        {groups.map(([group, rows]) => (
          <ShortcutGroup key={group} title={group} rows={rows} />
        ))}
      </div>
    </Dialog>
  )
}

function ShortcutGroup({
  title,
  rows,
  wide,
}: {
  title: string
  rows: { label: string; keys: string }[]
  wide?: boolean
}) {
  return (
    <div className={wide ? 'col-span-2' : undefined}>
      <h3 className="mb-1.5 text-[11px] font-semibold tracking-wide text-fg-dim uppercase">{title}</h3>
      <ul className="flex flex-col">
        {rows.map((row) => (
          <li key={row.label + row.keys} className="flex h-6 items-center justify-between gap-4">
            <span className="truncate text-fg">{row.label}</span>
            <kbd className="shrink-0 rounded bg-raised px-1.5 py-0.5 font-mono text-[11px] text-fg-dim">{row.keys}</kbd>
          </li>
        ))}
      </ul>
    </div>
  )
}
