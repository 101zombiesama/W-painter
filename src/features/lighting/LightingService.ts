import {
  ACESFilmicToneMapping,
  AgXToneMapping,
  Color,
  DirectionalLight,
  EquirectangularReflectionMapping,
  LinearToneMapping,
  NeutralToneMapping,
  PCFShadowMap,
  PMREMGenerator,
  type Mesh,
  type Texture,
  type ToneMapping,
} from 'three'
import { createStore, type StoreApi } from 'zustand/vanilla'
import type { AppContext } from '@/core/app/feature'
import { DisposableStore } from '@/core/utils/disposable'
import { createId } from '@/core/utils/id'
import type { Gesture, GestureHandler, ViewportService } from '@/features/viewport'
import { ENVIRONMENT_PRESETS } from './environments'

export type ToneMappingId = 'neutral' | 'aces' | 'agx' | 'linear'

export const TONE_MAPPINGS: { id: ToneMappingId; label: string; value: ToneMapping }[] = [
  { id: 'neutral', label: 'Neutral (true color)', value: NeutralToneMapping },
  { id: 'aces', label: 'ACES Filmic', value: ACESFilmicToneMapping },
  { id: 'agx', label: 'AgX', value: AgXToneMapping },
  { id: 'linear', label: 'Linear', value: LinearToneMapping },
]

export interface KeyLightState {
  enabled: boolean
  intensity: number
  /** Degrees around the vertical axis. */
  azimuth: number
  /** Degrees above the horizon. */
  elevation: number
  color: string
  shadows: boolean
}

export interface EnvironmentOption {
  id: string
  name: string
  swatch: string
}

export interface LightingState {
  environments: EnvironmentOption[]
  environmentId: string
  /** Environment rotation in degrees. */
  rotation: number
  intensity: number
  /** Exposure in stops (EV). */
  exposure: number
  toneMapping: ToneMappingId
  showBackground: boolean
  backgroundBlur: number
  backgroundColor: string
  keyLight: KeyLightState
}

/**
 * Image-based lighting, an optional directional key light with shadows,
 * and the display transform (exposure + tone mapping).
 */
export class LightingService implements GestureHandler {
  readonly store: StoreApi<LightingState> = createStore<LightingState>(() => ({
    environments: ENVIRONMENT_PRESETS.map(({ id, name, swatch }) => ({ id, name, swatch })),
    environmentId: 'studio',
    rotation: 0,
    intensity: 1,
    exposure: 0,
    toneMapping: 'neutral',
    showBackground: false,
    backgroundBlur: 0.35,
    backgroundColor: '#1b1e25',
    keyLight: { enabled: true, intensity: 1.2, azimuth: 40, elevation: 50, color: '#ffffff', shadows: false },
  }))

  private readonly viewport: ViewportService
  private readonly pmrem: PMREMGenerator
  private readonly textures = new Map<string, Texture>()
  private readonly keyLight = new DirectionalLight(0xffffff, 1)
  private readonly backgroundColor = new Color()
  private readonly disposables = new DisposableStore()

  constructor(ctx: AppContext) {
    this.viewport = ctx.services.get('viewport')
    this.pmrem = new PMREMGenerator(this.viewport.renderer)

    const shadow = this.keyLight.shadow
    shadow.mapSize.set(2048, 2048)
    shadow.camera.left = shadow.camera.bottom = -1.6
    shadow.camera.right = shadow.camera.top = 1.6
    shadow.camera.near = 0.1
    shadow.camera.far = 12
    shadow.bias = -0.0004
    shadow.normalBias = 0.02
    this.viewport.renderer.shadowMap.type = PCFShadowMap
    this.viewport.scene.add(this.keyLight, this.keyLight.target)

    this.disposables.add(this.store.subscribe(() => this.apply()))
    this.disposables.add(ctx.events.on('project:textureSetAdded', (set) => this.configureMesh(set.mesh)))
    // Shift + right-drag spins the environment, a quick way to inspect highlights.
    this.disposables.add(this.viewport.addGestureHandler(this, 20))
    this.apply()
  }

  update(patch: Partial<LightingState>): void {
    this.store.setState(patch)
  }

  updateKeyLight(patch: Partial<KeyLightState>): void {
    this.store.setState((state) => ({ keyLight: { ...state.keyLight, ...patch } }))
  }

  /** Loads a user-supplied .hdr or .exr panorama and makes it the active environment. */
  async loadFile(file: File): Promise<void> {
    const url = URL.createObjectURL(file)
    try {
      const extension = file.name.split('.').pop()?.toLowerCase()
      let source: Texture
      if (extension === 'exr') {
        const { EXRLoader } = await import('three/addons/loaders/EXRLoader.js')
        source = await new EXRLoader().loadAsync(url)
      } else if (extension === 'hdr') {
        const { HDRLoader } = await import('three/addons/loaders/HDRLoader.js')
        source = await new HDRLoader().loadAsync(url)
      } else {
        throw new Error('Environment maps must be .hdr or .exr files.')
      }
      source.mapping = EquirectangularReflectionMapping
      const texture = this.pmrem.fromEquirectangular(source).texture
      source.dispose()

      const id = createId('env')
      this.textures.set(id, texture)
      const name = file.name.replace(/\.[^.]+$/, '')
      this.store.setState((state) => ({
        environments: [
          ...state.environments,
          { id, name, swatch: 'linear-gradient(135deg, #5b6472, #2a2e36)' },
        ],
        environmentId: id,
      }))
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  begin(event: PointerEvent): Gesture | null {
    if (event.button !== 2 || !event.shiftKey) return null
    let lastX = event.clientX
    return {
      move: (e) => {
        const rotation = (this.store.getState().rotation + (e.clientX - lastX) * 0.4 + 360) % 360
        lastX = e.clientX
        this.update({ rotation })
      },
      end: () => {},
    }
  }

  dispose(): void {
    this.disposables.dispose()
    this.viewport.scene.remove(this.keyLight, this.keyLight.target)
    this.viewport.scene.environment = null
    this.viewport.scene.background = null
    for (const texture of this.textures.values()) texture.dispose()
    this.textures.clear()
    this.keyLight.shadow.dispose()
    this.pmrem.dispose()
  }

  private getEnvironment(id: string): Texture | null {
    let texture = this.textures.get(id)
    if (!texture) {
      const preset = ENVIRONMENT_PRESETS.find((p) => p.id === id)
      if (!preset) return null
      texture = preset.create(this.pmrem)
      this.textures.set(id, texture)
    }
    return texture
  }

  private configureMesh(mesh: Mesh): void {
    const shadows = this.store.getState().keyLight.shadows
    mesh.castShadow = shadows
    mesh.receiveShadow = shadows
  }

  /** Pushes the whole lighting state to the scene. Cheap enough to run on every change. */
  private apply(): void {
    const state = this.store.getState()
    const { scene, renderer } = this.viewport

    const environment = this.getEnvironment(state.environmentId)
    scene.environment = environment
    scene.environmentIntensity = state.intensity
    const radians = (state.rotation * Math.PI) / 180
    scene.environmentRotation.set(0, radians, 0)
    scene.backgroundRotation.set(0, radians, 0)

    if (state.showBackground && environment) {
      scene.background = environment
      scene.backgroundBlurriness = state.backgroundBlur
      scene.backgroundIntensity = state.intensity
    } else {
      scene.background = this.backgroundColor.set(state.backgroundColor)
    }

    renderer.toneMapping = TONE_MAPPINGS.find((t) => t.id === state.toneMapping)?.value ?? NeutralToneMapping
    renderer.toneMappingExposure = Math.pow(2, state.exposure)

    const key = state.keyLight
    this.keyLight.visible = key.enabled
    this.keyLight.intensity = key.intensity
    this.keyLight.color.set(key.color)
    const azimuth = (key.azimuth * Math.PI) / 180
    const elevation = (key.elevation * Math.PI) / 180
    this.keyLight.position
      .set(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.cos(azimuth) * Math.cos(elevation))
      .multiplyScalar(5)

    const shadows = key.enabled && key.shadows
    if (renderer.shadowMap.enabled !== shadows || this.keyLight.castShadow !== shadows) {
      renderer.shadowMap.enabled = shadows
      this.keyLight.castShadow = shadows
      this.viewport.content.traverse((object) => {
        const mesh = object as Mesh
        if (!mesh.isMesh) return
        mesh.castShadow = shadows
        mesh.receiveShadow = shadows
        // Shadow support is compiled into the shader.
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        for (const material of materials) material.needsUpdate = true
      })
    }

    this.viewport.requestRender()
  }
}
