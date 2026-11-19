import { Fragment, useRef, useState, type ReactNode } from 'react'
import { cx } from './cx'
import { Popover } from './overlays'

export interface MenuEntry {
  id: string
  label: string
  shortcut?: string
  section?: string
  disabled?: boolean
  run(): void
}

/** A button that opens a dropdown list of actions. */
export function Menu({
  label,
  entries,
  children,
  align = 'bottom-start',
  buttonClassName,
}: {
  label: string
  entries: MenuEntry[]
  /** Button content; defaults to the label. */
  children?: ReactNode
  align?: 'bottom-start' | 'bottom-end'
  buttonClassName?: string
}) {
  const anchor = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        ref={anchor}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen(!open)}
        className={cx(
          'flex h-7 items-center gap-1 rounded-md px-2 text-[12px] transition-colors',
          open ? 'bg-hover text-fg' : 'text-fg-dim hover:bg-hover hover:text-fg',
          buttonClassName,
        )}
      >
        {children ?? label}
      </button>
      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} placement={align} className="min-w-[220px] p-1">
        <div role="menu">
          {entries.map((entry, index) => {
            const previous = entries[index - 1]
            const divider = previous !== undefined && previous.section !== entry.section
            return (
              <Fragment key={entry.id}>
                {divider && <div className="my-1 h-px bg-line" />}
                <button
                  type="button"
                  role="menuitem"
                  disabled={entry.disabled}
                  onClick={() => {
                    setOpen(false)
                    entry.run()
                  }}
                  className="flex h-7 w-full items-center justify-between gap-6 rounded-md px-2.5 text-left text-[12px] text-fg hover:bg-hover disabled:text-fg-faint disabled:hover:bg-transparent"
                >
                  <span className="truncate">{entry.label}</span>
                  {entry.shortcut && <span className="font-mono text-[11px] text-fg-faint">{entry.shortcut}</span>}
                </button>
              </Fragment>
            )
          })}
        </div>
      </Popover>
    </>
  )
}
