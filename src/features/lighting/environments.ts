import {
  DataTexture,
  DataUtils,
  EquirectangularReflectionMapping,
  HalfFloatType,
  LinearFilter,
  LinearSRGBColorSpace,
  RGBAFormat,
  type PMREMGenerator,
  type Texture,
} from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'

type Vec3 = [number, number, number]

/** Radiance arriving from a direction (unit vector, +y up), in linear RGB. */
type SkyFunction = (x: number, y: number, z: number) => Vec3

export interface EnvironmentPreset {
  id: string
  name: string
  /** CSS background used as a thumbnail in the UI. */
  swatch: string
  /** Builds the prefiltered (PMREM) environment texture. */
  create(pmrem: PMREMGenerator): Texture
}

const WIDTH = 512
const HEIGHT = 256

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

function mix(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}

/** A soft-edged light: full strength inside `inner`, fading to zero at `outer` (cosines). */
function lobe(x: number, y: number, z: number, dir: Vec3, inner: number, outer: number): number {
  return smoothstep(outer, inner, x * dir[0] + y * dir[1] + z * dir[2])
}

/** Renders a sky function into an HDR equirectangular texture and prefilters it. */
function fromSky(pmrem: PMREMGenerator, sky: SkyFunction): Texture {
  const data = new Uint16Array(WIDTH * HEIGHT * 4)
  for (let j = 0; j < HEIGHT; j++) {
    const elevation = ((j + 0.5) / HEIGHT - 0.5) * Math.PI
    const cosE = Math.cos(elevation)
    const y = Math.sin(elevation)
    for (let i = 0; i < WIDTH; i++) {
      const azimuth = ((i + 0.5) / WIDTH - 0.5) * Math.PI * 2
      const [r, g, b] = sky(cosE * Math.cos(azimuth), y, cosE * Math.sin(azimuth))
      const o = (j * WIDTH + i) * 4
      data[o] = DataUtils.toHalfFloat(Math.min(r, 60000))
      data[o + 1] = DataUtils.toHalfFloat(Math.min(g, 60000))
      data[o + 2] = DataUtils.toHalfFloat(Math.min(b, 60000))
      data[o + 3] = DataUtils.toHalfFloat(1)
    }
  }
  const equirect = new DataTexture(data, WIDTH, HEIGHT, RGBAFormat, HalfFloatType)
  equirect.mapping = EquirectangularReflectionMapping
  equirect.colorSpace = LinearSRGBColorSpace
  equirect.minFilter = LinearFilter
  equirect.magFilter = LinearFilter
  equirect.needsUpdate = true
  const texture = pmrem.fromEquirectangular(equirect).texture
  equirect.dispose()
  return texture
}

function add(color: Vec3, light: Vec3, amount: number): void {
  color[0] += light[0] * amount
  color[1] += light[1] * amount
  color[2] += light[2] * amount
}

const softboxKey = normalize([0.5, 0.75, 0.45])
const softboxFill = normalize([-0.85, 0.25, 0.3])
const softboxRim = normalize([-0.2, 0.35, -0.9])

const daySun = normalize([0.45, 0.72, 0.35])
const sunsetSun = normalize([0.75, 0.12, -0.3])

const neonA = normalize([0.8, 0.3, 0.4])
const neonB = normalize([-0.8, 0.2, -0.3])
const neonTop = normalize([0, 1, 0.1])

/**
 * Built-in lighting setups. All are generated in code, so the app ships
 * without any HDRI downloads; users can still load their own .hdr/.exr files.
 */
export const ENVIRONMENT_PRESETS: EnvironmentPreset[] = [
  {
    id: 'studio',
    name: 'Studio',
    swatch: 'linear-gradient(160deg, #f5f1ea 0%, #b9b4ab 45%, #4b4a4d 100%)',
    create: (pmrem) => {
      const room = new RoomEnvironment()
      const texture = pmrem.fromScene(room, 0.04).texture
      room.dispose()
      return texture
    },
  },
  {
    id: 'softbox',
    name: 'Softbox',
    swatch: 'radial-gradient(circle at 68% 25%, #ffffff 0%, #8a8d94 30%, #1d1f24 75%)',
    create: (pmrem) =>
      fromSky(pmrem, (x, y, z) => {
        const color: Vec3 = mix([0.035, 0.035, 0.04], [0.11, 0.11, 0.12], y * 0.5 + 0.5)
        add(color, [1, 0.97, 0.93], lobe(x, y, z, softboxKey, 0.9, 0.72) * 9)
        add(color, [0.75, 0.85, 1], lobe(x, y, z, softboxFill, 0.93, 0.8) * 2.4)
        add(color, [1, 1, 1], lobe(x, y, z, softboxRim, 0.95, 0.86) * 5)
        return color
      }),
  },
  {
    id: 'daylight',
    name: 'Daylight',
    swatch: 'linear-gradient(180deg, #3f7fd6 0%, #a9cdf2 52%, #8c8776 54%, #5d594d 100%)',
    create: (pmrem) =>
      fromSky(pmrem, (x, y, z) => {
        if (y < 0) {
          // Sunlit ground bounce, darkening toward nadir.
          return mix([0.34, 0.31, 0.26], [0.12, 0.11, 0.1], smoothstep(0, -0.6, y))
        }
        const color = mix([0.95, 1.05, 1.2], [0.16, 0.36, 0.86], Math.pow(y, 0.45))
        add(color, [1, 0.96, 0.88], lobe(x, y, z, daySun, 0.9995, 0.996) * 900)
        add(color, [1, 0.95, 0.85], lobe(x, y, z, daySun, 0.99, 0.9) * 1.6)
        return color
      }),
  },
  {
    id: 'sunset',
    name: 'Sunset',
    swatch: 'linear-gradient(180deg, #2b2a5a 0%, #b4546b 38%, #ffb35c 52%, #3a2a2a 56%, #1b1516 100%)',
    create: (pmrem) =>
      fromSky(pmrem, (x, y, z) => {
        if (y < 0) return mix([0.11, 0.07, 0.06], [0.03, 0.025, 0.03], smoothstep(0, -0.5, y))
        const color = mix([1.25, 0.55, 0.22], [0.1, 0.11, 0.3], Math.pow(y, 0.55))
        add(color, [1, 0.5, 0.2], lobe(x, y, z, sunsetSun, 0.999, 0.992) * 350)
        add(color, [1, 0.45, 0.18], lobe(x, y, z, sunsetSun, 0.97, 0.6) * 2.2)
        return color
      }),
  },
  {
    id: 'overcast',
    name: 'Overcast',
    swatch: 'linear-gradient(180deg, #d9dde2 0%, #b3b9c0 52%, #6d6f70 55%, #474848 100%)',
    create: (pmrem) =>
      fromSky(pmrem, (_x, y) => {
        if (y < 0) return mix([0.2, 0.2, 0.19], [0.07, 0.07, 0.07], smoothstep(0, -0.7, y))
        return mix([0.62, 0.65, 0.69], [1.05, 1.08, 1.12], Math.pow(y, 0.7))
      }),
  },
  {
    id: 'neon',
    name: 'Neon Night',
    swatch: 'linear-gradient(110deg, #ff3d9a 0%, #1a1026 45%, #0d1a2b 55%, #18e0d0 100%)',
    create: (pmrem) =>
      fromSky(pmrem, (x, y, z) => {
        const color: Vec3 = mix([0.012, 0.012, 0.02], [0.03, 0.03, 0.06], y * 0.5 + 0.5)
        add(color, [0.05, 1, 0.9], lobe(x, y, z, neonA, 0.93, 0.7) * 7)
        add(color, [1, 0.12, 0.6], lobe(x, y, z, neonB, 0.93, 0.7) * 7)
        add(color, [0.5, 0.55, 1], lobe(x, y, z, neonTop, 0.97, 0.85) * 1.5)
        return color
      }),
  },
]
