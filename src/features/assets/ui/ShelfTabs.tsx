import { Plus } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { useStore } from 'zustand'
import { useService } from '@/core/app/react'
import { pickFiles } from '@/core/utils/download'
import type { RGB } from '@/core/utils/math'
import type { ChannelId } from '@/features/project/channels'
import { cx } from '@/shared/ui/cx'
import { notify } from '@/shared/ui/toast'
import type { ImageAssetKind } from '../AssetService'
import { BRUSH_PRESETS, MATERIAL_PRESETS, renderMaterialThumbnail, type MaterialPreset } from '../presets'

function Grid({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap content-start gap-1.5 p-2">{children}</div>
}

/** A square thumbnail button with a caption. */
function Tile({
  label,
  selected,
  onClick,
  children,
  title,
}: {
  label: string
  selected?: boolean
  onClick(): void
  children: ReactNode
  title?: string
}) {
  return (
    <button
      type="button"
      title={title ?? label}
      aria-pressed={selected}
      onClick={onClick}
      className={cx(
        'group flex w-[68px] flex-col items-center gap-1 rounded-md p-1 transition-colors',
        selected ? 'bg-accent-soft' : 'hover:bg-hover',
      )}
    >
      <span
        className={cx(
          'flex h-[58px] w-[58px] items-center justify-center overflow-hidden rounded border',
          selected ? 'border-accent' : 'border-line-strong',
        )}
      >
        {children}
      </span>
      <span className={cx('w-full truncate text-center text-[10.5px]', selected ? 'text-fg' : 'text-fg-dim')}>
        {label}
      </span>
    </button>
  )
}

function ImportTile({ kind }: { kind: ImageAssetKind }) {
  const assets = useService('assets')
  const paint = useService('paint')
  return (
    <Tile
      label="Import…"
      title={kind === 'alpha' ? 'Import an image as a brush alpha' : 'Import an image as a stamp'}
      onClick={async () => {
        const [file] = await pickFiles('image/png,image/jpeg,image/webp')
        if (!file) return
        try {
          const id = await assets.importImage(file, kind)
          if (kind === 'alpha') paint.actions.setBrush({ tipId: id })
          else paint.actions.setStamp(id)
        } catch (error) {
          console.error(error)
          notify('Could not read that image.', 'error')
        }
      }}
    >
      <span className="flex h-full w-full items-center justify-center bg-raised text-fg-faint group-hover:text-fg">
        <Plus size={18} />
      </span>
    </Tile>
  )
}

export function BrushesTab() {
  const paint = useService('paint')
  const assets = useService('assets')
  const tipId = useStore(paint.store, (state) => state.brush.tipId)
  const alphas = useStore(assets.store, (state) => state.alphas)

  return (
    <Grid>
      {BRUSH_PRESETS.map((preset) => {
        const tip = preset.settings.tipId ?? 'round'
        const thumbnail = alphas.find((alpha) => alpha.id === tip)?.thumbnail
        const hardness = preset.settings.hardness ?? 0.5
        return (
          <Tile
            key={preset.id}
            label={preset.name}
            selected={false}
            title={`${preset.name} — applies tip and dynamics, keeps your size`}
            onClick={() => {
              paint.actions.setBrush(preset.settings)
              if (paint.store.getState().tool !== 'erase') paint.actions.setTool('paint')
            }}
          >
            <span className="checkerboard flex h-full w-full items-center justify-center">
              {thumbnail ? (
                <img src={thumbnail} alt="" className="h-full w-full object-contain" />
              ) : (
                <span
                  className="h-11 w-11 rounded-full"
                  style={{ background: `radial-gradient(circle, #fff ${hardness * 68}%, transparent 70%)` }}
                />
              )}
            </span>
          </Tile>
        )
      })}
      <span className="sr-only">Current tip: {tipId}</span>
    </Grid>
  )
}

export function AlphasTab() {
  const paint = useService('paint')
  const assets = useService('assets')
  const alphas = useStore(assets.store, (state) => state.alphas)
  const tipId = useStore(paint.store, (state) => state.brush.tipId)
  const select = (id: string) => {
    paint.actions.setBrush({ tipId: id })
    if (paint.store.getState().tool === 'stamp' || paint.store.getState().tool === 'picker') {
      paint.actions.setTool('paint')
    }
  }

  return (
    <Grid>
      <Tile label="Round" selected={tipId === 'round'} onClick={() => select('round')}>
        <span className="checkerboard flex h-full w-full items-center justify-center">
          <span className="h-11 w-11 rounded-full bg-[radial-gradient(circle,#fff_45%,transparent_70%)]" />
        </span>
      </Tile>
      {alphas.map((alpha) => (
        <Tile key={alpha.id} label={alpha.name} selected={tipId === alpha.id} onClick={() => select(alpha.id)}>
          <img src={alpha.thumbnail} alt="" className="checkerboard h-full w-full object-contain" />
        </Tile>
      ))}
      <ImportTile kind="alpha" />
    </Grid>
  )
}

export function StampsTab() {
  const paint = useService('paint')
  const assets = useService('assets')
  const stamps = useStore(assets.store, (state) => state.stamps)
  const stampId = useStore(paint.store, (state) => state.stampId)
  const tool = useStore(paint.store, (state) => state.tool)

  return (
    <Grid>
      {stamps.map((stamp) => (
        <Tile
          key={stamp.id}
          label={stamp.name}
          selected={tool === 'stamp' && stampId === stamp.id}
          title={`${stamp.name} — click the model to place it. Enable Height to emboss.`}
          onClick={() => {
            paint.actions.setStamp(stamp.id)
            paint.actions.setTool('stamp')
          }}
        >
          <img src={stamp.thumbnail} alt="" className="checkerboard h-full w-full object-contain" />
        </Tile>
      ))}
      <ImportTile kind="stamp" />
    </Grid>
  )
}

function materialValues(preset: MaterialPreset): Partial<Record<ChannelId, RGB>> {
  const values: Partial<Record<ChannelId, RGB>> = {
    baseColor: preset.color,
    roughness: [preset.roughness, preset.roughness, preset.roughness],
    metallic: [preset.metallic, preset.metallic, preset.metallic],
  }
  if (preset.emissive) values.emissive = preset.emissive
  return values
}

export function MaterialsTab() {
  const paint = useService('paint')
  const layers = useService('layers')
  const project = useService('project')
  const thumbnails = useMemo(() => MATERIAL_PRESETS.map((preset) => renderMaterialThumbnail(preset)), [])

  const apply = (preset: MaterialPreset) => {
    const values = materialValues(preset)
    // Load it on the brush...
    paint.actions.applyMaterial(values)
    if (!preset.emissive) paint.actions.setChannel('emissive', { enabled: false })
    // ...and, when a fill layer is selected, onto that layer too.
    const textureSetId = project.store.getState().activeId
    const active = textureSetId ? layers.getActiveLayer(textureSetId) : null
    if (textureSetId && active?.kind === 'fill') {
      layers.setFillValues(textureSetId, active.id, values)
      if (!preset.emissive) layers.setFillChannel(textureSetId, active.id, 'emissive', { enabled: false })
    }
  }

  return (
    <Grid>
      {MATERIAL_PRESETS.map((preset, index) => (
        <Tile
          key={preset.id}
          label={preset.name}
          title={`${preset.name} — loads onto the brush (and the selected fill layer)`}
          onClick={() => apply(preset)}
        >
          <img src={thumbnails[index]} alt="" className="h-full w-full bg-raised object-contain p-0.5" />
        </Tile>
      ))}
    </Grid>
  )
}
