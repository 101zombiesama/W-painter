import { Upload } from 'lucide-react'
import { useStore } from 'zustand'
import { useService } from '@/core/app/react'
import { pickFiles } from '@/core/utils/download'
import { hexToRgb, rgbToHex } from '@/core/utils/math'
import { ColorField } from '@/shared/ui/ColorField'
import { Button, Row, Section, Select, ToggleRow } from '@/shared/ui/controls'
import { cx } from '@/shared/ui/cx'
import { Slider } from '@/shared/ui/Slider'
import { notify } from '@/shared/ui/toast'
import { TONE_MAPPINGS } from '../LightingService'

const TONE_OPTIONS = TONE_MAPPINGS.map((entry) => ({ value: entry.id, label: entry.label }))
const degrees = (value: number) => `${Math.round(value)}°`

export function LightingPanel() {
  const lighting = useService('lighting')
  const state = useStore(lighting.store)
  const key = state.keyLight

  const loadEnvironment = async () => {
    const [file] = await pickFiles('.hdr,.exr')
    if (!file) return
    try {
      await lighting.loadFile(file)
    } catch (error) {
      console.error(error)
      notify(error instanceof Error ? error.message : 'Could not load that environment.', 'error')
    }
  }

  return (
    <div>
      <Section title="Environment">
        <div className="grid grid-cols-3 gap-1.5">
          {state.environments.map((environment) => (
            <button
              key={environment.id}
              type="button"
              aria-pressed={environment.id === state.environmentId}
              onClick={() => lighting.update({ environmentId: environment.id })}
              className={cx(
                'flex flex-col gap-1 rounded-md p-1 text-left transition-colors',
                environment.id === state.environmentId ? 'bg-accent-soft' : 'hover:bg-hover',
              )}
            >
              <span
                className={cx(
                  'h-10 w-full rounded border',
                  environment.id === state.environmentId ? 'border-accent' : 'border-line-strong',
                )}
                style={{ background: environment.swatch }}
              />
              <span className="w-full truncate text-[10.5px] text-fg-dim">{environment.name}</span>
            </button>
          ))}
        </div>
        <Button icon={Upload} onClick={loadEnvironment} title="Load an equirectangular .hdr or .exr panorama">
          Load HDRI…
        </Button>
        <Slider
          label="Rotation"
          value={state.rotation}
          min={0}
          max={360}
          step={1}
          format={degrees}
          defaultValue={0}
          title="Also: Shift + right-drag in the viewport"
          onChange={(rotation) => lighting.update({ rotation })}
        />
        <Slider
          label="Intensity"
          value={state.intensity}
          min={0}
          max={4}
          defaultValue={1}
          onChange={(intensity) => lighting.update({ intensity })}
        />
        <ToggleRow
          label="Show as background"
          checked={state.showBackground}
          onChange={(showBackground) => lighting.update({ showBackground })}
        />
        {state.showBackground ? (
          <Slider
            label="Blur"
            value={state.backgroundBlur}
            min={0}
            max={1}
            defaultValue={0.35}
            onChange={(backgroundBlur) => lighting.update({ backgroundBlur })}
          />
        ) : (
          <Row label="Background">
            <ColorField
              label="Background color"
              value={hexToRgb(state.backgroundColor)}
              onChange={(value) => lighting.update({ backgroundColor: rgbToHex(value) })}
            />
          </Row>
        )}
      </Section>

      <Section title="Key light">
        <ToggleRow label="Enabled" checked={key.enabled} onChange={(enabled) => lighting.updateKeyLight({ enabled })} />
        <Slider
          label="Intensity"
          value={key.intensity}
          min={0}
          max={8}
          disabled={!key.enabled}
          defaultValue={1.2}
          onChange={(intensity) => lighting.updateKeyLight({ intensity })}
        />
        <Slider
          label="Direction"
          value={key.azimuth}
          min={-180}
          max={180}
          step={1}
          format={degrees}
          disabled={!key.enabled}
          defaultValue={40}
          onChange={(azimuth) => lighting.updateKeyLight({ azimuth })}
        />
        <Slider
          label="Height"
          value={key.elevation}
          min={-10}
          max={90}
          step={1}
          format={degrees}
          disabled={!key.enabled}
          defaultValue={50}
          onChange={(elevation) => lighting.updateKeyLight({ elevation })}
        />
        <Row label="Color">
          <ColorField
            label="Key light color"
            value={hexToRgb(key.color)}
            onChange={(value) => lighting.updateKeyLight({ color: rgbToHex(value) })}
          />
        </Row>
        <ToggleRow
          label="Cast shadows"
          checked={key.shadows}
          onChange={(shadows) => lighting.updateKeyLight({ shadows })}
        />
      </Section>

      <Section title="Display">
        <Slider
          label="Exposure"
          value={state.exposure}
          min={-4}
          max={4}
          format={(value) => `${value >= 0 ? '+' : ''}${value.toFixed(1)} EV`}
          defaultValue={0}
          onChange={(exposure) => lighting.update({ exposure })}
        />
        <Row label="Tone mapping">
          <Select
            label="Tone mapping"
            className="flex-1"
            value={state.toneMapping}
            options={TONE_OPTIONS}
            onChange={(toneMapping) => lighting.update({ toneMapping })}
          />
        </Row>
      </Section>
    </div>
  )
}
