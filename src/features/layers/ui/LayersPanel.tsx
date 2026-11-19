import {
  ArrowDown,
  ArrowUp,
  Brush,
  Copy,
  Eye,
  EyeOff,
  PaintBucket,
  Plus,
  SquareDashed,
  Trash2,
} from 'lucide-react'
import { useState } from 'react'
import { useStore } from 'zustand'
import { useService } from '@/core/app/react'
import { CHANNELS, getChannel, type ChannelId } from '@/features/project/channels'
import { ChannelRow } from '@/features/project/ui/ChannelRow'
import { Button, EmptyState, IconButton, Row, Section, Segmented, Select, ToggleRow } from '@/shared/ui/controls'
import { cx } from '@/shared/ui/cx'
import { Slider } from '@/shared/ui/Slider'
import type { LayerService } from '../LayerService'
import { BLEND_MODES, type LayerData, type LayerStack, type PaintTarget } from '../types'

const CHANNEL_OPTIONS = CHANNELS.map((channel) => ({ value: channel.id, label: channel.label }))
const BLEND_OPTIONS = BLEND_MODES.map((mode) => ({ value: mode.id, label: mode.label }))

export function LayersPanel() {
  const layers = useService('layers')
  const project = useService('project')
  const textureSetId = useStore(project.store, (state) => state.activeId)
  const stack = useStore(layers.store, (state) => (textureSetId ? state.stacks[textureSetId] : undefined))
  const channel = useStore(layers.store, (state) => state.channelContext)

  if (!textureSetId || !stack) {
    return <EmptyState>Open a model to start working with layers.</EmptyState>
  }

  const active = stack.layers.find((layer) => layer.id === stack.activeLayerId) ?? null
  // The stack is stored bottom-up; lists read better top-down.
  const ordered = [...stack.layers].reverse()

  return (
    <div className="flex flex-col">
      <div className="flex h-10 items-center gap-1 border-b border-line px-2">
        <Button icon={Plus} onClick={() => layers.addLayer(textureSetId, 'paint')} title="Add a paint layer">
          Paint
        </Button>
        <Button
          icon={Plus}
          onClick={() => layers.addLayer(textureSetId, 'fill')}
          title="Add a fill layer (uniform material, usually combined with a mask)"
        >
          Fill
        </Button>
        <div className="flex-1" />
        <Select
          label="Channel shown in the layer list"
          className="w-[112px]"
          value={channel}
          options={CHANNEL_OPTIONS}
          onChange={(id) => layers.setChannelContext(id)}
        />
      </div>

      <ul className="flex flex-col gap-px p-1.5">
        {ordered.map((layer) => (
          <LayerRow
            key={layer.id}
            layer={layer}
            stack={stack}
            channel={channel}
            textureSetId={textureSetId}
            layers={layers}
          />
        ))}
        {ordered.length === 0 && <EmptyState>No layers. Add a paint layer to begin.</EmptyState>}
      </ul>

      {active && (
        <LayerProperties
          key={active.id}
          layer={active}
          target={stack.paintTarget}
          channel={channel}
          textureSetId={textureSetId}
          layers={layers}
        />
      )}
    </div>
  )
}

function LayerRow({
  layer,
  stack,
  channel,
  textureSetId,
  layers,
}: {
  layer: LayerData
  stack: LayerStack
  channel: ChannelId
  textureSetId: string
  layers: LayerService
}) {
  const [renaming, setRenaming] = useState(false)
  const isActive = stack.activeLayerId === layer.id
  const index = stack.layers.indexOf(layer)
  const KindIcon = layer.kind === 'fill' ? PaintBucket : Brush
  const opacity = Math.round(layer.channels[channel].opacity * 100)

  return (
    <li
      onClick={() => layers.selectLayer(textureSetId, layer.id, 'content')}
      className={cx(
        'group flex h-10 cursor-pointer items-center gap-1.5 rounded-md pr-1 pl-1 transition-colors',
        isActive ? 'bg-accent-soft' : 'hover:bg-hover',
        !layer.visible && 'opacity-55',
      )}
    >
      <IconButton
        size="sm"
        icon={layer.visible ? Eye : EyeOff}
        label={layer.visible ? 'Hide layer' : 'Show layer'}
        onClick={(event) => {
          event.stopPropagation()
          layers.setVisible(textureSetId, layer.id, !layer.visible)
        }}
      />

      {/* Content and mask chips show what the brush will edit. */}
      <span
        title={layer.kind === 'fill' ? 'Fill layer' : 'Paint layer'}
        className={cx(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded border bg-raised text-fg-dim',
          isActive && stack.paintTarget === 'content' ? 'border-accent text-accent-strong' : 'border-line-strong',
        )}
      >
        <KindIcon size={14} />
      </span>
      {layer.mask && (
        <button
          type="button"
          title="Mask — click to paint on it"
          onClick={(event) => {
            event.stopPropagation()
            layers.selectLayer(textureSetId, layer.id, 'mask')
          }}
          className={cx(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded border bg-gradient-to-br from-white/85 to-black',
            isActive && stack.paintTarget === 'mask' ? 'border-accent' : 'border-line-strong',
            !layer.mask.enabled && 'opacity-35',
          )}
        >
          <SquareDashed size={13} className="text-black/60" />
        </button>
      )}

      {renaming ? (
        <input
          autoFocus
          defaultValue={layer.name}
          aria-label="Layer name"
          onClick={(event) => event.stopPropagation()}
          onBlur={(event) => {
            const name = event.target.value.trim()
            if (name && name !== layer.name) layers.renameLayer(textureSetId, layer.id, name)
            setRenaming(false)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
            if (event.key === 'Escape') setRenaming(false)
          }}
          className="h-6 min-w-0 flex-1 rounded bg-app px-1.5 text-[12px] text-fg"
        />
      ) : (
        <span
          className="min-w-0 flex-1 truncate pl-0.5 text-[12px] text-fg"
          title="Double-click to rename"
          onDoubleClick={() => setRenaming(true)}
        >
          {layer.name}
        </span>
      )}

      {isActive ? (
        <span className="flex shrink-0 items-center">
          <IconButton
            size="sm"
            icon={ArrowUp}
            label="Move up"
            disabled={index >= stack.layers.length - 1}
            onClick={(event) => {
              event.stopPropagation()
              layers.moveLayer(textureSetId, layer.id, 1)
            }}
          />
          <IconButton
            size="sm"
            icon={ArrowDown}
            label="Move down"
            disabled={index <= 0}
            onClick={(event) => {
              event.stopPropagation()
              layers.moveLayer(textureSetId, layer.id, -1)
            }}
          />
          <IconButton
            size="sm"
            icon={Copy}
            label="Duplicate layer"
            onClick={(event) => {
              event.stopPropagation()
              layers.duplicateLayer(textureSetId, layer.id)
            }}
          />
          <IconButton
            size="sm"
            icon={Trash2}
            label="Delete layer"
            onClick={(event) => {
              event.stopPropagation()
              layers.removeLayer(textureSetId, layer.id)
            }}
          />
        </span>
      ) : (
        <span className="shrink-0 pr-1.5 font-mono text-[11px] text-fg-faint">{opacity}%</span>
      )}
    </li>
  )
}

function LayerProperties({
  layer,
  target,
  channel,
  textureSetId,
  layers,
}: {
  layer: LayerData
  target: PaintTarget
  channel: ChannelId
  textureSetId: string
  layers: LayerService
}) {
  const settings = layer.channels[channel]
  const channelDef = getChannel(channel)

  return (
    <div className="border-t border-line">
      <Section title={`Blending · ${channelDef.label}`}>
        <Row label="Blend mode">
          <Select
            label="Blend mode"
            className="flex-1"
            value={settings.blend}
            options={BLEND_OPTIONS}
            onChange={(blend) => layers.setChannelSettings(textureSetId, layer.id, channel, { blend })}
          />
        </Row>
        <Slider
          label="Opacity"
          value={settings.opacity * 100}
          min={0}
          max={100}
          defaultValue={100}
          format={(value) => `${Math.round(value)}%`}
          onChange={(value) =>
            layers.setChannelSettings(textureSetId, layer.id, channel, { opacity: value / 100 }, false)
          }
          onCommit={() => layers.commitEdit()}
        />
      </Section>

      {layer.fill && (
        <Section title="Fill material">
          {CHANNELS.map((def) => (
            <ChannelRow
              key={def.id}
              channel={def}
              enabled={layer.fill![def.id].enabled}
              value={layer.fill![def.id].value}
              onToggle={(enabled) => layers.setFillChannel(textureSetId, layer.id, def.id, { enabled })}
              onChange={(value) => layers.setFillChannel(textureSetId, layer.id, def.id, { value }, false)}
              onCommit={() => layers.commitEdit()}
            />
          ))}
          <p className="leading-snug text-fg-faint">Tip: pick a material in the shelf to apply it to this fill.</p>
        </Section>
      )}

      <Section title="Mask">
        {layer.mask ? (
          <>
            <Row label="Brush edits">
              <Segmented
                value={target}
                options={[
                  { value: 'content', label: layer.kind === 'fill' ? 'Fill' : 'Paint', title: 'Edit the layer content' },
                  { value: 'mask', label: 'Mask', title: 'Paint where the layer is visible' },
                ]}
                onChange={(value) => layers.selectLayer(textureSetId, layer.id, value)}
              />
            </Row>
            <ToggleRow
              label="Mask enabled"
              checked={layer.mask.enabled}
              onChange={(enabled) => layers.setMaskEnabled(textureSetId, layer.id, enabled)}
            />
            <div className="flex gap-1.5 pt-0.5">
              <Button className="flex-1" onClick={() => layers.invertMask(textureSetId, layer.id)}>
                Invert
              </Button>
              <Button className="flex-1" variant="danger" onClick={() => layers.removeMask(textureSetId, layer.id)}>
                Remove
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="leading-snug text-fg-faint">
              A mask controls where this layer shows. Paint white to reveal, black to hide.
            </p>
            <div className="flex gap-1.5">
              <Button
                className="flex-1"
                title="Start fully hidden, then paint to reveal"
                onClick={() => layers.addMask(textureSetId, layer.id, 'black')}
              >
                Black mask
              </Button>
              <Button
                className="flex-1"
                title="Start fully visible, then paint to hide"
                onClick={() => layers.addMask(textureSetId, layer.id, 'white')}
              >
                White mask
              </Button>
            </div>
          </>
        )}
      </Section>
    </div>
  )
}
