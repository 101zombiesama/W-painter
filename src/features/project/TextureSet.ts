import {
  Color,
  Mesh,
  MeshStandardMaterial,
  ShaderMaterial,
  type BufferGeometry,
  type Material,
  type WebGLRenderTarget,
} from 'three'
import { acceleratedRaycast, MeshBVH } from 'three-mesh-bvh'
import type { GpuContext } from '@/core/gpu/GpuContext'
import { expandRect, type PxRect } from '@/core/gpu/Rect'
import { createTarget } from '@/core/gpu/targets'
import { createId } from '@/core/utils/id'
import { CHANNELS, getChannel, mapChannels, type ChannelId } from './channels'
import { SurfaceMaps } from './SurfaceMaps'
import { TileGrid, type TileBounds } from './TileGrid'

/** Where v = 0 sits in the source asset's UV convention. Matters only for export. */
export type UvOrigin = 'bottom-left' | 'top-left'

/** What the viewport shows: the lit material, or one isolated map. */
export type ViewMode = 'material' | ChannelId | 'normal'

export interface TextureSetParams {
  name: string
  geometry: BufferGeometry
  uvOrigin: UvOrigin
  resolution: number
  /** True when the UV layout was created by the auto-unwrapper. */
  generatedUVs: boolean
}

/** Surface maps are capped: positions interpolate well, and 4K float maps are huge. */
const MAX_SURFACE_MAP_SIZE = 2048

const CHANNEL_VIEW_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const CHANNEL_VIEW_FRAGMENT = /* glsl */ `
uniform sampler2D tMap;
uniform int uMode; // 0 color, 1 scalar, 2 signed scalar, 3 raw rgb
varying vec2 vUv;
vec3 toLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}
void main() {
  vec4 texel = texture2D(tMap, vUv);
  vec3 color;
  if (uMode == 0) color = texel.rgb;
  else if (uMode == 1) color = toLinear(vec3(texel.r));
  else if (uMode == 2) color = toLinear(vec3(clamp(texel.r * 0.5 + 0.5, 0.0, 1.0)));
  else color = toLinear(texel.rgb);
  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}
`

/**
 * One paintable material slot of the model: a mesh, its UV-space surface
 * maps, and the flattened PBR textures the viewport displays.
 *
 * The layer stack that produces those textures lives in the layers feature;
 * a TextureSet only owns the *results* and how they are shown.
 */
export class TextureSet {
  readonly id = createId('set')
  readonly name: string
  readonly geometry: BufferGeometry
  readonly mesh: Mesh
  readonly uvOrigin: UvOrigin
  readonly generatedUVs: boolean
  readonly tiles: TileGrid
  readonly triangleCount: number

  /** Height-to-normal intensity. */
  normalStrength = 1

  private readonly gpu: GpuContext
  private _resolution = 0
  private _surface!: SurfaceMaps
  private _outputs!: Record<ChannelId, WebGLRenderTarget>
  private _orm!: WebGLRenderTarget
  private _normal!: WebGLRenderTarget
  private readonly pbrMaterial: MeshStandardMaterial
  private readonly channelViewMaterial: ShaderMaterial
  private viewMode: ViewMode = 'material'

  constructor(gpu: GpuContext, params: TextureSetParams) {
    this.gpu = gpu
    this.name = params.name
    this.geometry = params.geometry
    this.uvOrigin = params.uvOrigin
    this.generatedUVs = params.generatedUVs

    // Bounding volume hierarchy: makes brush raycasts O(log n).
    this.geometry.boundsTree = new MeshBVH(this.geometry)
    this.geometry.computeBoundingBox()
    this.geometry.computeBoundingSphere()
    const index = this.geometry.getIndex()
    this.triangleCount = (index ? index.count : this.geometry.getAttribute('position').count) / 3
    this.tiles = new TileGrid(this.geometry)

    this.pbrMaterial = new MeshStandardMaterial({
      roughness: 1,
      metalness: 1,
      emissive: new Color(1, 1, 1),
    })
    this.channelViewMaterial = new ShaderMaterial({
      vertexShader: CHANNEL_VIEW_VERTEX,
      fragmentShader: CHANNEL_VIEW_FRAGMENT,
      uniforms: { tMap: { value: null }, uMode: { value: 0 } },
      toneMapped: false,
    })

    this.mesh = new Mesh(this.geometry, this.pbrMaterial)
    this.mesh.name = params.name
    this.mesh.raycast = acceleratedRaycast
    this.mesh.matrixAutoUpdate = false
    this.mesh.userData.textureSetId = this.id

    this.allocate(params.resolution)
  }

  get resolution(): number {
    return this._resolution
  }

  get surface(): SurfaceMaps {
    return this._surface
  }

  /** Flattened result of the layer stack for one channel. */
  output(channel: ChannelId): WebGLRenderTarget {
    return this._outputs[channel]
  }

  /** Packed occlusion (R), roughness (G), metallic (B). */
  get orm(): WebGLRenderTarget {
    return this._orm
  }

  /** Tangent-space normal map derived from the height channel. */
  get normal(): WebGLRenderTarget {
    return this._normal
  }

  /** Extra texels around a dirty region that strokes may touch through gutter dilation. */
  get dilationMargin(): number {
    return Math.ceil((this._surface.margin * this._resolution) / this._surface.size) + 2
  }

  /** Average number of texels per world unit on this set's surface. */
  get texelsPerWorldUnit(): number {
    return this.tiles.uvPerWorldUnit * this._resolution
  }

  /** Converts tile bounds to a padded pixel rectangle at the current resolution. */
  rectFromTiles(bounds: TileBounds): PxRect {
    const tile = this._resolution / this.tiles.grid
    const rect: PxRect = {
      x: Math.floor(bounds.x0 * tile),
      y: Math.floor(bounds.y0 * tile),
      w: Math.ceil((bounds.x1 - bounds.x0 + 1) * tile),
      h: Math.ceil((bounds.y1 - bounds.y0 + 1) * tile),
    }
    return expandRect(rect, this.dilationMargin, this._resolution)
  }

  /** Reallocates every GPU resource owned by the set at a new resolution. */
  setResolution(resolution: number): void {
    if (resolution === this._resolution) return
    this.release()
    this.allocate(resolution)
  }

  setViewMode(mode: ViewMode): void {
    this.viewMode = mode
    let material: Material = this.pbrMaterial
    if (mode !== 'material') {
      const uniforms = this.channelViewMaterial.uniforms
      if (mode === 'normal') {
        uniforms.tMap.value = this._normal.texture
        uniforms.uMode.value = 3
      } else {
        const channel = getChannel(mode)
        uniforms.tMap.value = this._outputs[mode].texture
        uniforms.uMode.value = channel.kind === 'color' ? 0 : channel.min < 0 ? 2 : 1
      }
      material = this.channelViewMaterial
    }
    this.mesh.material = material
  }

  dispose(): void {
    this.release()
    this.geometry.boundsTree = undefined
    this.geometry.dispose()
    this.pbrMaterial.dispose()
    this.channelViewMaterial.dispose()
  }

  private allocate(resolution: number): void {
    const gpu = this.gpu
    this._resolution = resolution
    this._surface = new SurfaceMaps(gpu, this.geometry, Math.min(resolution, MAX_SURFACE_MAP_SIZE))

    const anisotropy = Math.min(8, gpu.caps.maxAnisotropy)
    this._outputs = mapChannels((channel) =>
      channel.kind === 'color'
        ? createTarget(resolution, resolution, channel.outputFormat, { mipmaps: true, anisotropy })
        : createTarget(resolution, resolution, channel.outputFormat, { filter: 'linear' }),
    )
    this._orm = createTarget(resolution, resolution, 'rgba8', { mipmaps: true, anisotropy })
    this._normal = createTarget(resolution, resolution, 'rgba8', { mipmaps: true, anisotropy })

    // Give every output a defined value before the first composite.
    for (const channel of CHANNELS) {
      gpu.fill(this._outputs[channel.id], channel.base[0], channel.base[1], channel.base[2], 1)
    }
    gpu.fill(this._orm, 1, 0.5, 0, 1)
    gpu.fill(this._normal, 0.5, 0.5, 1, 1)
    gpu.end()

    const m = this.pbrMaterial
    m.map = this._outputs.baseColor.texture
    m.emissiveMap = this._outputs.emissive.texture
    m.aoMap = this._orm.texture
    m.roughnessMap = this._orm.texture
    m.metalnessMap = this._orm.texture
    m.normalMap = this._normal.texture
    m.needsUpdate = true
    this.setViewMode(this.viewMode)
  }

  private release(): void {
    this._surface.dispose()
    for (const channel of CHANNELS) this._outputs[channel.id].dispose()
    this._orm.dispose()
    this._normal.dispose()
  }
}
