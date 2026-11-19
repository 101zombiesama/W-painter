import { Sphere, Vector3, type BufferGeometry } from 'three'
import { createStore, type StoreApi } from 'zustand/vanilla'
import type { AppContext } from '@/core/app/feature'
import type { ViewportService } from '@/features/viewport'
import { TextureSet, type UvOrigin, type ViewMode } from './TextureSet'

export interface ModelPart {
  name: string
  /** World-space geometry with position, normal and uv attributes. */
  geometry: BufferGeometry
  uvOrigin: UvOrigin
  generatedUVs: boolean
}

export interface PreparedModel {
  name: string
  parts: ModelPart[]
}

export interface TextureSetInfo {
  id: string
  name: string
  resolution: number
  triangles: number
  generatedUVs: boolean
  normalStrength: number
}

export interface ProjectState {
  modelName: string | null
  textureSets: TextureSetInfo[]
  activeId: string | null
  viewMode: ViewMode
  /** Non-null while a long operation (import, unwrap) is running. */
  busy: string | null
}

export const RESOLUTIONS = [512, 1024, 2048, 4096] as const

declare module '@/core/events/EventBus' {
  interface AppEvents {
    /** A texture set was created; its outputs still hold default values. */
    'project:textureSetAdded': TextureSet
    'project:textureSetRemoved': TextureSet
    /** Fired before a resolution change so owners can resample their data. */
    'project:textureSetResizing': { textureSet: TextureSet; resolution: number }
    'project:textureSetResized': TextureSet
    /** A display setting (e.g. normal strength) changed. */
    'project:textureSetChanged': TextureSet
    'project:modelLoaded': { name: string }
  }
}

/**
 * Owns the open model: its texture sets, which one is active, and how the
 * viewport displays them. This is the root of the document model.
 */
export class ProjectService {
  readonly store: StoreApi<ProjectState> = createStore<ProjectState>(() => ({
    modelName: null,
    textureSets: [],
    activeId: null,
    viewMode: 'material',
    busy: null,
  }))

  private readonly ctx: AppContext
  private readonly viewport: ViewportService
  private sets: TextureSet[] = []

  constructor(ctx: AppContext) {
    this.ctx = ctx
    this.viewport = ctx.services.get('viewport')
  }

  get textureSets(): readonly TextureSet[] {
    return this.sets
  }

  get active(): TextureSet | null {
    const id = this.store.getState().activeId
    return this.sets.find((set) => set.id === id) ?? null
  }

  find(id: string): TextureSet | null {
    return this.sets.find((set) => set.id === id) ?? null
  }

  /** Replaces the current model. Undo history does not survive this. */
  setModel(model: PreparedModel): void {
    this.clear()

    const maxSize = this.viewport.gpu.caps.maxTextureSize
    const preferred = model.parts.length === 1 ? 2048 : 1024
    const resolution = Math.min(preferred, maxSize)

    for (const part of model.parts) {
      const set = new TextureSet(this.viewport.gpu, {
        name: part.name,
        geometry: part.geometry,
        uvOrigin: part.uvOrigin,
        generatedUVs: part.generatedUVs,
        resolution,
      })
      set.setViewMode(this.store.getState().viewMode)
      this.sets.push(set)
      this.viewport.content.add(set.mesh)
    }

    this.store.setState({ modelName: model.name, activeId: this.sets[0]?.id ?? null })
    this.syncStore()
    for (const set of this.sets) this.ctx.events.emit('project:textureSetAdded', set)
    this.ctx.events.emit('project:modelLoaded', { name: model.name })
    this.frameAll()
  }

  setActive(id: string): void {
    if (!this.find(id)) return
    this.store.setState({ activeId: id })
  }

  setResolution(id: string, resolution: number): void {
    const set = this.find(id)
    if (!set || set.resolution === resolution) return
    // Texture snapshots in the undo stack are tied to the old resolution.
    this.ctx.history.clear()
    this.ctx.events.emit('project:textureSetResizing', { textureSet: set, resolution })
    set.setResolution(resolution)
    this.syncStore()
    this.ctx.events.emit('project:textureSetResized', set)
    this.viewport.requestRender()
  }

  setNormalStrength(id: string, value: number): void {
    const set = this.find(id)
    if (!set) return
    set.normalStrength = value
    this.syncStore()
    this.ctx.events.emit('project:textureSetChanged', set)
  }

  setViewMode(mode: ViewMode): void {
    this.store.setState({ viewMode: mode })
    for (const set of this.sets) set.setViewMode(mode)
    this.viewport.requestRender()
  }

  setBusy(message: string | null): void {
    this.store.setState({ busy: message })
  }

  /** Fits the whole model in view. */
  frameAll(): void {
    if (this.sets.length === 0) return
    const sphere = new Sphere(new Vector3(), 0)
    let first = true
    for (const set of this.sets) {
      const bounds = set.geometry.boundingSphere
      if (!bounds) continue
      if (first) {
        sphere.copy(bounds)
        first = false
      } else {
        sphere.union(bounds)
      }
    }
    if (!first) this.viewport.frame(sphere)
  }

  dispose(): void {
    this.clear()
  }

  private clear(): void {
    this.ctx.history.clear()
    for (const set of this.sets) {
      this.viewport.content.remove(set.mesh)
      this.ctx.events.emit('project:textureSetRemoved', set)
      set.dispose()
    }
    this.sets = []
    this.store.setState({ modelName: null, activeId: null, textureSets: [] })
  }

  private syncStore(): void {
    this.store.setState({
      textureSets: this.sets.map((set) => ({
        id: set.id,
        name: set.name,
        resolution: set.resolution,
        triangles: set.triangleCount,
        generatedUVs: set.generatedUVs,
        normalStrength: set.normalStrength,
      })),
    })
  }
}
