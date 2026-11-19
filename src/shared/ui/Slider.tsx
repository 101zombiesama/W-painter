import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { clamp } from '@/core/utils/math'
import { cx } from './cx'

export interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  /** Called continuously while dragging. */
  onChange(value: number): void
  /** Called once when a drag or text edit ends (use for undo checkpoints). */
  onCommit?(): void
  step?: number
  /** `log` spreads small values out, e.g. for brush size. */
  scale?: 'linear' | 'log'
  /** Formats the value for display. */
  format?(value: number): string
  /** Double-click resets to this value. */
  defaultValue?: number
  disabled?: boolean
  title?: string
}

function toRatio(value: number, min: number, max: number, scale: 'linear' | 'log'): number {
  if (scale === 'log') return Math.log(value / min) / Math.log(max / min)
  return (value - min) / (max - min)
}

function fromRatio(ratio: number, min: number, max: number, scale: 'linear' | 'log'): number {
  if (scale === 'log') return min * Math.pow(max / min, ratio)
  return min + (max - min) * ratio
}

/** A compact labelled slider with an editable numeric readout. */
export function Slider({
  label,
  value,
  min,
  max,
  onChange,
  onCommit,
  step,
  scale = 'linear',
  format,
  defaultValue,
  disabled,
  title,
}: SliderProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const [draft, setDraft] = useState<string | null>(null)

  const ratio = clamp(toRatio(clamp(value, min, max), min, max, scale), 0, 1)
  const display = format ? format(value) : formatNumber(value)

  const setFromPointer = (clientX: number) => {
    const track = trackRef.current
    if (!track) return
    const rect = track.getBoundingClientRect()
    const r = clamp((clientX - rect.left) / rect.width, 0, 1)
    let next = fromRatio(r, min, max, scale)
    if (step) next = Math.round(next / step) * step
    onChange(clamp(next, min, max))
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled || event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragging.current = true
    setFromPointer(event.clientX)
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (dragging.current) setFromPointer(event.clientX)
  }

  const endDrag = () => {
    if (!dragging.current) return
    dragging.current = false
    onCommit?.()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return
    const direction = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : 0
    if (direction === 0) return
    event.preventDefault()
    const nextRatio = clamp(ratio + direction * (event.shiftKey ? 0.1 : 0.01), 0, 1)
    onChange(clamp(fromRatio(nextRatio, min, max, scale), min, max))
    onCommit?.()
  }

  const commitDraft = () => {
    if (draft === null) return
    const parsed = Number.parseFloat(draft.replace(',', '.'))
    setDraft(null)
    if (Number.isNaN(parsed)) return
    onChange(clamp(parsed, min, max))
    onCommit?.()
  }

  // If the component unmounts mid-drag, still close the edit.
  useEffect(() => () => endDrag(), []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={cx('flex h-6 items-center gap-2', disabled && 'opacity-40')} title={title}>
      <span className="w-[78px] shrink-0 truncate text-fg-dim">{label}</span>
      <div
        ref={trackRef}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        className="group relative h-5 flex-1 cursor-ew-resize touch-none rounded bg-raised"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        onDoubleClick={() => {
          if (defaultValue === undefined || disabled) return
          onChange(defaultValue)
          onCommit?.()
        }}
      >
        <div
          className="absolute inset-y-0 left-0 rounded bg-accent/30 group-hover:bg-accent/40"
          style={{ width: `${ratio * 100}%` }}
        />
        <div
          className="absolute inset-y-0.5 w-0.5 rounded-full bg-accent-strong"
          style={{ left: `calc(${ratio * 100}% - 1px)` }}
        />
      </div>
      <input
        className="h-5 w-[46px] shrink-0 rounded bg-raised px-1 text-right font-mono text-[11px] text-fg tabular-nums focus:bg-hover"
        value={draft ?? display}
        disabled={disabled}
        aria-label={`${label} value`}
        onFocus={(event) => {
          setDraft(formatNumber(value))
          requestAnimationFrame(() => event.target.select())
        }}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commitDraft}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
          if (event.key === 'Escape') {
            setDraft(null)
            event.currentTarget.blur()
          }
        }}
      />
    </div>
  )
}

function formatNumber(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 100) return value.toFixed(0)
  if (abs >= 10) return value.toFixed(1)
  return value.toFixed(2)
}
