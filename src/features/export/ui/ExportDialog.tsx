import { Download } from 'lucide-react'
import { useStore } from 'zustand'
import { useService } from '@/core/app/react'
import { Button, Row, Segmented } from '@/shared/ui/controls'
import { cx } from '@/shared/ui/cx'
import { Dialog } from '@/shared/ui/overlays'
import { notify } from '@/shared/ui/toast'
import { EXPORT_MAPS, type ExportMapId } from '../ExportService'

export function ExportButton() {
  const exporter = useService('export')
  return (
    <Button variant="primary" icon={Download} onClick={() => exporter.openDialog()} title="Export textures as PNG">
      Export
    </Button>
  )
}

export function ExportDialog() {
  const exporter = useService('export')
  const project = useService('project')
  const { dialogOpen, exporting, options } = useStore(exporter.store)
  const textureSets = useStore(project.store, (state) => state.textureSets)
  const activeId = useStore(project.store, (state) => state.activeId)
  const active = textureSets.find((set) => set.id === activeId)

  const toggle = (id: ExportMapId) => {
    const maps = options.maps.includes(id) ? options.maps.filter((m) => m !== id) : [...options.maps, id]
    exporter.setOptions({ maps })
  }

  const run = async () => {
    try {
      const count = await exporter.export()
      exporter.closeDialog()
      notify(`Exported ${count} texture${count === 1 ? '' : 's'}.`, 'success')
    } catch (error) {
      console.error(error)
      notify('Export failed. See the console for details.', 'error')
    }
  }

  const setCount = options.scope === 'all' ? textureSets.length : 1
  const fileCount = options.maps.length * setCount

  return (
    <Dialog
      open={dialogOpen}
      title="Export textures"
      onClose={() => exporter.closeDialog()}
      footer={
        <>
          <span className="mr-auto text-fg-faint">
            {fileCount} PNG file{fileCount === 1 ? '' : 's'}
            {fileCount > 1 ? ', zipped' : ''}
            {active ? ` · ${active.resolution}px` : ''}
          </span>
          <Button variant="ghost" onClick={() => exporter.closeDialog()}>
            Cancel
          </Button>
          <Button variant="primary" icon={Download} disabled={exporting || fileCount === 0} onClick={run}>
            {exporting ? 'Exporting…' : 'Export'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <h3 className="mb-2 text-[11px] font-semibold tracking-wide text-fg-dim uppercase">Maps</h3>
          <div className="grid grid-cols-2 gap-1.5">
            {EXPORT_MAPS.map((map) => {
              const checked = options.maps.includes(map.id)
              return (
                <label
                  key={map.id}
                  className={cx(
                    'flex cursor-pointer items-start gap-2.5 rounded-md border px-2.5 py-2 transition-colors',
                    checked ? 'border-accent/60 bg-accent-soft' : 'border-line hover:bg-hover',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(map.id)}
                    className="mt-0.5 accent-[var(--color-accent)]"
                  />
                  <span className="min-w-0">
                    <span className="block text-[12px] text-fg">{map.label}</span>
                    <span className="block truncate text-[11px] text-fg-faint">{map.description}</span>
                  </span>
                </label>
              )
            })}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-[11px] font-semibold tracking-wide text-fg-dim uppercase">Options</h3>
          <Row label="Normal map" title="OpenGL: green points up (Blender, Unity, glTF). DirectX: green points down (Unreal).">
            <Segmented
              value={options.normalFormat}
              options={[
                { value: 'opengl', label: 'OpenGL (Y+)' },
                { value: 'directx', label: 'DirectX (Y−)' },
              ]}
              onChange={(normalFormat) => exporter.setOptions({ normalFormat })}
            />
          </Row>
          {textureSets.length > 1 && (
            <Row label="Texture sets">
              <Segmented
                value={options.scope}
                options={[
                  { value: 'all', label: `All (${textureSets.length})` },
                  { value: 'active', label: active?.name ?? 'Active' },
                ]}
                onChange={(scope) => exporter.setOptions({ scope })}
              />
            </Row>
          )}
        </div>
      </div>
    </Dialog>
  )
}
