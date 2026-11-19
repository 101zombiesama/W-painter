import { Brush, Eraser, FlipHorizontal2, Pipette, Stamp } from 'lucide-react'
import { useRef, useState } from 'react'
import { useStore } from 'zustand'
import { useService } from '@/core/app/react'
import type { IconComponent } from '@/core/app/UiRegistry'
import { IconButton, Segmented, ToggleRow } from '@/shared/ui/controls'
import { Popover } from '@/shared/ui/overlays'
import type { SymmetryAxis, ToolId } from '../store'

export const TOOLS: { id: ToolId; label: string; icon: IconComponent; key: string }[] = [
  { id: 'paint', label: 'Brush', icon: Brush, key: 'B' },
  { id: 'erase', label: 'Eraser', icon: Eraser, key: 'E' },
  { id: 'stamp', label: 'Stamp', icon: Stamp, key: 'S' },
  { id: 'picker', label: 'Material picker', icon: Pipette, key: 'I' },
]

const AXES: { value: SymmetryAxis; label: string }[] = [
  { value: 'x', label: 'X' },
  { value: 'y', label: 'Y' },
  { value: 'z', label: 'Z' },
]

/** Tool buttons and the symmetry toggle in the left rail. */
export function ToolRail() {
  const paint = useService('paint')
  const tool = useStore(paint.store, (state) => state.tool)
  const symmetry = useStore(paint.store, (state) => state.symmetry)
  const symmetryAnchor = useRef<HTMLDivElement>(null)
  const [symmetryOpen, setSymmetryOpen] = useState(false)

  return (
    <>
      {TOOLS.map(({ id, label, icon, key }) => (
        <IconButton
          key={id}
          size="lg"
          icon={icon}
          label={`${label} (${key})`}
          active={tool === id}
          onClick={() => paint.actions.setTool(id)}
        />
      ))}
      <div className="my-1 h-px w-6 bg-line" />
      <div ref={symmetryAnchor}>
        <IconButton
          size="lg"
          icon={FlipHorizontal2}
          label="Symmetry (L)"
          active={symmetry.enabled}
          onClick={() => setSymmetryOpen(!symmetryOpen)}
        />
      </div>
      <Popover
        anchor={symmetryAnchor}
        open={symmetryOpen}
        onClose={() => setSymmetryOpen(false)}
        placement="right-start"
        className="flex w-[200px] flex-col gap-2 p-3"
      >
        <ToggleRow
          label="Mirror strokes"
          checked={symmetry.enabled}
          onChange={(enabled) => paint.actions.setSymmetry({ enabled })}
        />
        <Segmented value={symmetry.axis} options={AXES} onChange={(axis) => paint.actions.setSymmetry({ axis })} />
        <p className="leading-snug text-fg-faint">Strokes are mirrored across the model's center plane.</p>
      </Popover>
    </>
  )
}
