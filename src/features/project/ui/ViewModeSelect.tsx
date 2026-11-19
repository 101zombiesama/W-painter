import { Eye } from 'lucide-react'
import { useStore } from 'zustand'
import { useService } from '@/core/app/react'
import { Select } from '@/shared/ui/controls'
import { CHANNELS } from '../channels'
import type { ViewMode } from '../TextureSet'

export const VIEW_MODES: { value: ViewMode; label: string }[] = [
  { value: 'material', label: 'Material (lit)' },
  ...CHANNELS.map((channel) => ({ value: channel.id as ViewMode, label: channel.label })),
  { value: 'normal', label: 'Normal' },
]

/** Switches the viewport between the lit material and isolated maps. */
export function ViewModeSelect() {
  const project = useService('project')
  const viewMode = useStore(project.store, (state) => state.viewMode)
  return (
    <div className="flex items-center gap-1.5" title="What the viewport displays (C cycles, M returns to material)">
      <Eye size={14} className="text-fg-faint" />
      <Select
        label="View mode"
        className="w-[136px]"
        value={viewMode}
        options={VIEW_MODES}
        onChange={(mode) => project.setViewMode(mode)}
      />
    </div>
  )
}
