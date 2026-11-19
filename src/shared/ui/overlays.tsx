import { X } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from 'zustand'
import { cx } from './cx'
import { dismissToast, toastStore, type ToastKind } from './toast'

// --- popover ----------------------------------------------------------------

interface PopoverProps {
  /** Element the popover is attached to. */
  anchor: RefObject<HTMLElement | null>
  open: boolean
  onClose(): void
  children: ReactNode
  placement?: 'bottom-start' | 'bottom-end' | 'right-start' | 'left-start'
  className?: string
}

/**
 * A floating surface positioned next to an anchor. Rendered in a portal with
 * fixed positioning so it is never clipped by scrolling panels.
 */
export function Popover({ anchor, open, onClose, children, placement = 'bottom-start', className }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null)
      return
    }
    const anchorEl = anchor.current
    const popover = ref.current
    if (!anchorEl || !popover) return
    const a = anchorEl.getBoundingClientRect()
    const p = popover.getBoundingClientRect()
    const gap = 6
    let left = a.left
    let top = a.bottom + gap
    if (placement === 'bottom-end') left = a.right - p.width
    if (placement === 'right-start') {
      left = a.right + gap
      top = a.top
    }
    if (placement === 'left-start') {
      left = a.left - p.width - gap
      top = a.top
    }
    // Keep it on screen.
    left = Math.max(8, Math.min(left, window.innerWidth - p.width - 8))
    top = Math.max(8, Math.min(top, window.innerHeight - p.height - 8))
    setPosition({ left, top })
  }, [open, anchor, placement])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (ref.current?.contains(target) || anchor.current?.contains(target)) return
      onClose()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose, anchor])

  if (!open) return null
  return createPortal(
    <div
      ref={ref}
      className={cx(
        'fixed z-50 rounded-lg border border-line-strong bg-panel shadow-2xl shadow-black/60',
        className,
      )}
      style={{ left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? 'visible' : 'hidden' }}
    >
      {children}
    </div>,
    document.body,
  )
}

// --- dialog -----------------------------------------------------------------

export function Dialog({
  open,
  title,
  onClose,
  children,
  footer,
  width = 440,
}: {
  open: boolean
  title: string
  onClose(): void
  children: ReactNode
  footer?: ReactNode
  width?: number
}) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/55 backdrop-blur-[2px]"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex max-h-[86vh] flex-col rounded-xl border border-line-strong bg-panel shadow-2xl shadow-black/70"
        style={{ width, maxWidth: 'calc(100vw - 32px)' }}
      >
        <header className="flex h-11 shrink-0 items-center justify-between border-b border-line pr-2 pl-4">
          <h2 className="text-[13px] font-semibold">{title}</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-fg-dim hover:bg-hover hover:text-fg"
          >
            <X size={15} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
        {footer && (
          <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-line px-4 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  )
}

// --- toasts -----------------------------------------------------------------

const TOAST_ACCENT: Record<ToastKind, string> = {
  info: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  error: 'bg-danger',
}

export function Toasts() {
  const toasts = useStore(toastStore, (state) => state.toasts)
  return createPortal(
    <div className="pointer-events-none fixed bottom-10 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          onClick={() => dismissToast(toast.id)}
          className="pointer-events-auto flex max-w-[460px] cursor-pointer items-stretch overflow-hidden rounded-lg border border-line-strong bg-raised shadow-xl shadow-black/50"
          style={{ animation: 'toast-in 160ms ease-out' }}
        >
          <span className={cx('w-1 shrink-0', TOAST_ACCENT[toast.kind])} />
          <span className="px-3 py-2 text-[12px] leading-snug text-fg">{toast.message}</span>
        </div>
      ))}
    </div>,
    document.body,
  )
}
