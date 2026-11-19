import { ChevronDown, ChevronRight } from 'lucide-react'
import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import type { IconComponent } from '@/core/app/UiRegistry'
import { cx } from './cx'

// --- buttons ----------------------------------------------------------------

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'ghost' | 'danger'
  icon?: IconComponent
}

export function Button({ variant = 'default', icon: Icon, className, children, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={cx(
        'inline-flex h-7 items-center justify-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium transition-colors disabled:opacity-40',
        variant === 'default' && 'bg-raised text-fg hover:bg-hover active:bg-active',
        variant === 'primary' && 'bg-accent text-[#0d0f13] hover:bg-accent-strong',
        variant === 'ghost' && 'text-fg-dim hover:bg-hover hover:text-fg',
        variant === 'danger' && 'bg-raised text-danger hover:bg-danger/15',
        className,
      )}
      {...rest}
    >
      {Icon && <Icon size={14} />}
      {children}
    </button>
  )
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconComponent
  label: string
  active?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export function IconButton({ icon: Icon, label, active, size = 'md', className, ...rest }: IconButtonProps) {
  const box = size === 'sm' ? 'h-6 w-6' : size === 'lg' ? 'h-9 w-9' : 'h-7 w-7'
  const iconSize = size === 'sm' ? 13 : size === 'lg' ? 18 : 15
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-md transition-colors disabled:opacity-30',
        box,
        active ? 'bg-accent-soft text-accent-strong' : 'text-fg-dim hover:bg-hover hover:text-fg',
        className,
      )}
      {...rest}
    >
      <Icon size={iconSize} />
    </button>
  )
}

// --- form controls ----------------------------------------------------------

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean
  onChange(checked: boolean): void
  label?: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative h-4 w-7 shrink-0 rounded-full transition-colors disabled:opacity-40',
        checked ? 'bg-accent' : 'bg-active',
      )}
    >
      <span
        className={cx(
          'absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-[left]',
          checked ? 'left-[14px]' : 'left-0.5',
        )}
      />
    </button>
  )
}

/** A label on the left with any control on the right. */
export function Row({ label, children, title }: { label: string; children: ReactNode; title?: string }) {
  return (
    <div className="flex h-6 items-center gap-2" title={title}>
      <span className="w-[78px] shrink-0 truncate text-fg-dim">{label}</span>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">{children}</div>
    </div>
  )
}

export function ToggleRow({
  label,
  checked,
  onChange,
  title,
}: {
  label: string
  checked: boolean
  onChange(checked: boolean): void
  title?: string
}) {
  return (
    <div className="flex h-6 items-center justify-between gap-2" title={title}>
      <span className="truncate text-fg-dim">{label}</span>
      <Toggle checked={checked} onChange={onChange} label={label} />
    </div>
  )
}

export function Select<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: T
  options: readonly { value: T; label: string }[]
  onChange(value: T): void
  label?: string
  className?: string
}) {
  return (
    <div className={cx('relative min-w-0', className)}>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="h-6 w-full cursor-pointer appearance-none truncate rounded bg-raised pr-6 pl-2 text-[12px] text-fg hover:bg-hover"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown size={12} className="pointer-events-none absolute top-1.5 right-1.5 text-fg-faint" />
    </div>
  )
}

/** Mutually exclusive options shown side by side. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: readonly { value: T; label: string; title?: string }[]
  onChange(value: T): void
}) {
  return (
    <div className="flex h-6 w-full rounded bg-raised p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          title={option.title}
          onClick={() => onChange(option.value)}
          className={cx(
            'flex-1 truncate rounded-[3px] px-1.5 text-[11px] transition-colors',
            option.value === value ? 'bg-active text-fg' : 'text-fg-dim hover:text-fg',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

// --- structure --------------------------------------------------------------

/** A collapsible group inside a panel. */
export function Section({
  title,
  children,
  defaultOpen = true,
  actions,
}: {
  title: string
  children: ReactNode
  defaultOpen?: boolean
  actions?: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="border-b border-line">
      <div className="flex h-8 items-center pr-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex h-full min-w-0 flex-1 items-center gap-1 pl-2 text-left text-[11px] font-semibold tracking-wide text-fg-dim uppercase hover:text-fg"
        >
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          <span className="truncate">{title}</span>
        </button>
        {actions}
      </div>
      {open && <div className="flex flex-col gap-1.5 px-3 pt-0.5 pb-3">{children}</div>}
    </section>
  )
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="px-4 py-6 text-center leading-relaxed text-fg-faint">{children}</p>
}
