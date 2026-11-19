import { RefreshCw } from 'lucide-react'
import { useStore } from 'zustand'
import { useApp, useService } from '@/core/app/react'
import { Button, EmptyState, Row, Section, Select } from '@/shared/ui/controls'
import { cx } from '@/shared/ui/cx'
import { Slider } from '@/shared/ui/Slider'
import { RESOLUTIONS } from '../ProjectService'
import { UvPreview } from './UvPreview'

function formatCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`
  return String(value)
}

export function TextureSetsPanel() {
  const app = useApp()
  const project = useService('project')
  const textureSets = useStore(project.store, (state) => state.textureSets)
  const activeId = useStore(project.store, (state) => state.activeId)
  const maxSize = useService('viewport').gpu.caps.maxTextureSize

  const activeInfo = textureSets.find((set) => set.id === activeId)
  const activeSet = activeId ? project.find(activeId) : null

  if (textureSets.length === 0) {
    return <EmptyState>Open a model to see its texture sets.</EmptyState>
  }

  const resolutionOptions = RESOLUTIONS.filter((size) => size <= maxSize).map((size) => ({
    value: String(size),
    label: `${size} × ${size}`,
  }))

  return (
    <div>
      <Section title="Texture sets">
        <p className="-mt-0.5 mb-1 leading-snug text-fg-faint">
          One set per material. Each has its own layers and textures.
        </p>
        <div className="flex flex-col gap-0.5">
          {textureSets.map((set) => (
            <button
              key={set.id}
              type="button"
              onClick={() => project.setActive(set.id)}
              className={cx(
                'flex h-9 items-center justify-between gap-2 rounded-md px-2.5 text-left transition-colors',
                set.id === activeId ? 'bg-accent-soft text-fg' : 'text-fg-dim hover:bg-hover',
              )}
            >
              <span className="truncate font-medium">{set.name}</span>
              <span className="shrink-0 font-mono text-[11px] text-fg-faint">
                {set.resolution}px · {formatCount(set.triangles)} tris
              </span>
            </button>
          ))}
        </div>
      </Section>

      {activeInfo && activeSet && (
        <>
          <Section title="Settings">
            <Row label="Resolution" title="Changing resolution resamples every layer and clears undo history">
              <Select
                label="Resolution"
                className="flex-1"
                value={String(activeInfo.resolution)}
                options={resolutionOptions}
                onChange={(value) => project.setResolution(activeInfo.id, Number(value))}
              />
            </Row>
            <Slider
              label="Normal strength"
              title="How strongly painted height bends the surface normal"
              value={activeInfo.normalStrength}
              min={0}
              max={4}
              defaultValue={1}
              onChange={(value) => project.setNormalStrength(activeInfo.id, value)}
            />
          </Section>

          <Section title="UV layout">
            <UvPreview key={`${activeSet.id}`} textureSet={activeSet} />
            <p className="leading-snug text-fg-faint">
              {activeInfo.generatedUVs
                ? 'This layout was generated automatically.'
                : 'Using the UVs stored in the model file.'}
            </p>
            <Button
              icon={RefreshCw}
              title="Builds a new non-overlapping UV atlas. Painted layers are discarded."
              onClick={() => {
                const confirmed = window.confirm(
                  'Regenerate UVs for the whole model?\n\nThis creates a new UV layout and discards everything painted so far.',
                )
                if (confirmed) app.events.emit('project:regenerateUVsRequested', undefined)
              }}
            >
              Regenerate UVs
            </Button>
          </Section>
        </>
      )}
    </div>
  )
}
