import { RotateCcw } from 'lucide-react'
import { useStore } from 'zustand'
import { useService } from '@/core/app/react'
import { CHANNELS } from '@/features/project/channels'
import { ChannelRow } from '@/features/project/ui/ChannelRow'
import { Button, IconButton, Row, Section, Segmented, ToggleRow } from '@/shared/ui/controls'
import { Slider } from '@/shared/ui/Slider'
import { BRUSH_SIZE_MAX, BRUSH_SIZE_MIN, DEFAULT_BRUSH, type BrushAlignment } from '../store'
import { TOOLS } from './ToolRail'

const percent = (value: number) => `${Math.round(value)}%`

const ALIGNMENTS: { value: BrushAlignment; label: string; title: string }[] = [
  { value: 'surface', label: 'Surface', title: 'The brush lies flat on the surface under the cursor' },
  { value: 'camera', label: 'Camera', title: 'The brush faces the camera, like projecting a decal' },
]

/** Everything about the active tool: brush shape, dynamics and the material it paints. */
export function PaintPanel() {
  const paint = useService('paint')
  const layers = useService('layers')
  const project = useService('project')
  const { actions } = paint
  const tool = useStore(paint.store, (state) => state.tool)
  const brush = useStore(paint.store, (state) => state.brush)
  const stampId = useStore(paint.store, (state) => state.stampId)
  const material = useStore(paint.store, (state) => state.material)
  const maskValue = useStore(paint.store, (state) => state.maskValue)
  const textureSetId = useStore(project.store, (state) => state.activeId)
  const paintingMask = useStore(layers.store, (state) => {
    const stack = textureSetId ? state.stacks[textureSetId] : undefined
    if (!stack || stack.paintTarget !== 'mask') return false
    return stack.layers.some((layer) => layer.id === stack.activeLayerId && layer.mask !== null)
  })

  const toolInfo = TOOLS.find((entry) => entry.id === tool)!
  const isStamp = tool === 'stamp'
  const isPicker = tool === 'picker'
  const tipInfo = isStamp
    ? stampId
      ? paint.engine.describeTip(stampId)
      : null
    : brush.tipId === 'round'
      ? null
      : paint.engine.describeTip(brush.tipId)
  const usesRoundTip = !isStamp && brush.tipId === 'round'

  return (
    <div>
      <div className="flex h-10 items-center gap-2 border-b border-line px-3">
        <toolInfo.icon size={15} className="text-accent-strong" />
        <span className="text-[12px] font-semibold">{toolInfo.label}</span>
        <div className="flex-1" />
        <IconButton
          size="sm"
          icon={RotateCcw}
          label="Reset brush settings"
          onClick={() => actions.setBrush({ ...DEFAULT_BRUSH })}
        />
      </div>

      {isPicker ? (
        <p className="px-4 py-5 leading-relaxed text-fg-faint">
          Click the model to load its color, roughness and metallic values onto the brush.
        </p>
      ) : (
        <>
          <Section title={isStamp ? 'Stamp' : 'Brush'}>
            <div className="mb-1 flex items-center gap-2.5">
              <div className="checkerboard flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-md border border-line-strong">
                {tipInfo ? (
                  <img src={tipInfo.thumbnail} alt="" className="h-full w-full object-contain" />
                ) : isStamp ? (
                  <span className="text-[10px] text-fg-faint">none</span>
                ) : (
                  <span
                    className="h-8 w-8 rounded-full"
                    style={{
                      background: `radial-gradient(circle, #fff ${brush.hardness * 68}%, transparent 70%)`,
                    }}
                  />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] text-fg">
                  {tipInfo?.name ?? (isStamp ? 'No stamp selected' : 'Round')}
                </div>
                <div className="truncate text-fg-faint">
                  {isStamp ? 'Pick a stamp in the shelf below' : 'Pick alphas in the shelf below'}
                </div>
              </div>
              {!isStamp && !usesRoundTip && (
                <Button variant="ghost" onClick={() => actions.setBrush({ tipId: 'round' })}>
                  Round
                </Button>
              )}
            </div>

            <Slider
              label="Size"
              value={brush.size * 100}
              min={BRUSH_SIZE_MIN * 100}
              max={BRUSH_SIZE_MAX * 100}
              scale="log"
              defaultValue={DEFAULT_BRUSH.size * 100}
              title="Brush radius, as a percentage of the model size ([ and ])"
              onChange={(value) => actions.setBrush({ size: value / 100 })}
            />
            <Slider
              label="Opacity"
              value={brush.opacity * 100}
              min={1}
              max={100}
              format={percent}
              defaultValue={100}
              title="Maximum strength of a whole stroke"
              onChange={(value) => actions.setBrush({ opacity: value / 100 })}
            />
            {!isStamp && (
              <>
                <Slider
                  label="Flow"
                  value={brush.flow * 100}
                  min={1}
                  max={100}
                  format={percent}
                  defaultValue={100}
                  title="Paint laid down by each dab; low values build up gradually"
                  onChange={(value) => actions.setBrush({ flow: value / 100 })}
                />
                <Slider
                  label="Hardness"
                  value={brush.hardness * 100}
                  min={0}
                  max={100}
                  format={percent}
                  disabled={!usesRoundTip}
                  defaultValue={DEFAULT_BRUSH.hardness * 100}
                  title="Edge sharpness of the round tip"
                  onChange={(value) => actions.setBrush({ hardness: value / 100 })}
                />
                <Slider
                  label="Spacing"
                  value={brush.spacing * 100}
                  min={1}
                  max={200}
                  scale="log"
                  format={percent}
                  defaultValue={DEFAULT_BRUSH.spacing * 100}
                  title="Distance between dabs, relative to the brush diameter"
                  onChange={(value) => actions.setBrush({ spacing: value / 100 })}
                />
              </>
            )}
            <Slider
              label="Angle"
              value={brush.angle}
              min={-180}
              max={180}
              step={1}
              format={(value) => `${Math.round(value)}°`}
              defaultValue={0}
              onChange={(value) => actions.setBrush({ angle: value })}
            />
          </Section>

          {!isStamp && (
            <Section title="Dynamics" defaultOpen={false}>
              <Slider
                label="Size jitter"
                value={brush.sizeJitter * 100}
                min={0}
                max={100}
                format={percent}
                defaultValue={0}
                onChange={(value) => actions.setBrush({ sizeJitter: value / 100 })}
              />
              <Slider
                label="Angle jitter"
                value={brush.angleJitter * 100}
                min={0}
                max={100}
                format={percent}
                defaultValue={0}
                onChange={(value) => actions.setBrush({ angleJitter: value / 100 })}
              />
              <Slider
                label="Flow jitter"
                value={brush.flowJitter * 100}
                min={0}
                max={100}
                format={percent}
                defaultValue={0}
                onChange={(value) => actions.setBrush({ flowJitter: value / 100 })}
              />
              <Slider
                label="Scatter"
                value={brush.scatter * 100}
                min={0}
                max={200}
                format={percent}
                defaultValue={0}
                onChange={(value) => actions.setBrush({ scatter: value / 100 })}
              />
              <ToggleRow
                label="Follow stroke direction"
                checked={brush.followStroke}
                onChange={(followStroke) => actions.setBrush({ followStroke })}
              />
              <ToggleRow
                label="Pen pressure → size"
                checked={brush.pressureSize}
                onChange={(pressureSize) => actions.setBrush({ pressureSize })}
              />
              <ToggleRow
                label="Pen pressure → flow"
                checked={brush.pressureFlow}
                onChange={(pressureFlow) => actions.setBrush({ pressureFlow })}
              />
            </Section>
          )}

          <Section title="Projection" defaultOpen={false}>
            <Row label="Alignment">
              <Segmented
                value={brush.alignment}
                options={ALIGNMENTS}
                onChange={(alignment) => actions.setBrush({ alignment })}
              />
            </Row>
            <ToggleRow
              label="Skip back-facing surfaces"
              checked={brush.backfaceCulling}
              onChange={(backfaceCulling) => actions.setBrush({ backfaceCulling })}
            />
            {!isStamp && (
              <Slider
                label="Smoothing"
                value={brush.smoothing}
                min={0}
                max={80}
                step={1}
                format={(value) => `${Math.round(value)}px`}
                defaultValue={0}
                title="Lazy mouse: the brush trails the cursor for steadier lines"
                onChange={(value) => actions.setBrush({ smoothing: value })}
              />
            )}
          </Section>

          {paintingMask ? (
            <Section title="Mask paint">
              <Slider
                label="Value"
                value={maskValue * 100}
                min={0}
                max={100}
                format={percent}
                defaultValue={100}
                title="White (100%) reveals the layer, black (0%) hides it. X swaps."
                onChange={(value) => actions.setMaskValue(value / 100)}
              />
              <div className="flex gap-1.5">
                <Button className="flex-1" onClick={() => actions.setMaskValue(1)}>
                  Reveal (white)
                </Button>
                <Button className="flex-1" onClick={() => actions.setMaskValue(0)}>
                  Hide (black)
                </Button>
              </div>
              <p className="leading-snug text-fg-faint">You are painting the active layer's mask.</p>
            </Section>
          ) : tool === 'erase' ? (
            <Section title="Eraser">
              <p className="leading-snug text-fg-faint">
                Removes paint from every channel of the active layer, revealing the layers below.
              </p>
            </Section>
          ) : (
            <Section title="Material">
              <p className="-mt-0.5 mb-0.5 leading-snug text-fg-faint">
                Each stroke writes all enabled channels at once.
              </p>
              {CHANNELS.map((channel) => (
                <ChannelRow
                  key={channel.id}
                  channel={channel}
                  enabled={material[channel.id].enabled}
                  value={material[channel.id].value}
                  onToggle={(enabled) => actions.setChannel(channel.id, { enabled })}
                  onChange={(value) => actions.setChannel(channel.id, { value })}
                />
              ))}
            </Section>
          )}
        </>
      )}
    </div>
  )
}
