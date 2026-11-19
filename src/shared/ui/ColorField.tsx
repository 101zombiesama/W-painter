import { useRef, useState } from 'react'
import { HexColorInput, HexColorPicker } from 'react-colorful'
import { hexToRgb, rgbToHex, type RGB } from '@/core/utils/math'
import { cx } from './cx'
import { Popover } from './overlays'

const SWATCHES = [
  '#ffffff', '#c9ccd3', '#7d828e', '#2b2e36', '#000000', '#e2552b', '#f5b84a', '#f2e35b',
  '#63c66b', '#2fb8a6', '#3f8cff', '#6a5cff', '#b45cf0', '#f05c9f', '#8a5a3c', '#d9b38c',
]

/** A color swatch that opens a picker. Values are sRGB triples in 0..1. */
export function ColorField({
  value,
  onChange,
  onCommit,
  label,
  className,
}: {
  value: RGB
  onChange(value: RGB): void
  /** Called when the picker closes (use for undo checkpoints). */
  onCommit?(): void
  label: string
  className?: string
}) {
  const anchor = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const hex = rgbToHex(value)

  const close = () => {
    setOpen(false)
    onCommit?.()
  }

  return (
    <>
      <button
        ref={anchor}
        type="button"
        aria-label={label}
        title={`${label}: ${hex}`}
        onClick={() => (open ? close() : setOpen(true))}
        className={cx(
          'h-6 min-w-0 flex-1 rounded border border-line-strong transition-shadow hover:shadow-[0_0_0_1px_var(--color-accent)]',
          className,
        )}
        style={{ background: hex }}
      />
      <Popover anchor={anchor} open={open} onClose={close} placement="right-start" className="w-[228px] p-3">
        <div className="color-picker flex flex-col gap-2.5">
          <HexColorPicker color={hex} onChange={(next) => onChange(hexToRgb(next))} />
          <div className="flex items-center gap-2">
            <span className="text-fg-faint">Hex</span>
            <HexColorInput
              color={hex}
              prefixed
              onChange={(next) => onChange(hexToRgb(next))}
              className="h-6 min-w-0 flex-1 rounded bg-raised px-2 font-mono text-[11px] text-fg uppercase"
            />
          </div>
          <div className="grid grid-cols-8 gap-1">
            {SWATCHES.map((swatch) => (
              <button
                key={swatch}
                type="button"
                aria-label={swatch}
                onClick={() => onChange(hexToRgb(swatch))}
                className="aspect-square rounded-sm border border-black/40 hover:scale-110"
                style={{ background: swatch }}
              />
            ))}
          </div>
        </div>
      </Popover>
    </>
  )
}
