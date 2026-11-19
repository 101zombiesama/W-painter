import type { RGB } from '@/core/utils/math'
import { ColorField } from '@/shared/ui/ColorField'
import { Row, Toggle } from '@/shared/ui/controls'
import { cx } from '@/shared/ui/cx'
import { Slider } from '@/shared/ui/Slider'
import type { ChannelDef } from '../channels'

/**
 * One material channel as an editable row: an on/off switch plus a color
 * swatch or a value slider. Shared by the brush material and fill layers.
 */
export function ChannelRow({
  channel,
  enabled,
  value,
  onToggle,
  onChange,
  onCommit,
}: {
  channel: ChannelDef
  enabled: boolean
  value: RGB
  onToggle(enabled: boolean): void
  onChange(value: RGB): void
  onCommit?(): void
}) {
  return (
    <div className="flex items-center gap-2.5">
      <Toggle checked={enabled} onChange={onToggle} label={`${channel.label} channel`} />
      <div className={cx('min-w-0 flex-1 transition-opacity', !enabled && 'opacity-40')}>
        {channel.kind === 'color' ? (
          <Row label={channel.short} title={channel.label}>
            <ColorField label={channel.label} value={value} onChange={onChange} onCommit={onCommit} />
          </Row>
        ) : (
          <Slider
            label={channel.short}
            title={channel.label}
            value={value[0]}
            min={channel.min}
            max={channel.max}
            onChange={(v) => onChange([v, v, v])}
            onCommit={onCommit}
          />
        )}
      </div>
    </div>
  )
}
