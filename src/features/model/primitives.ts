import {
  CapsuleGeometry,
  ConeGeometry,
  CylinderGeometry,
  PlaneGeometry,
  SphereGeometry,
  TorusGeometry,
  TorusKnotGeometry,
  type BufferGeometry,
} from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

export interface PrimitiveDef {
  id: string
  name: string
  create(): BufferGeometry
  /**
   * The built-in UVs of this shape overlap (e.g. every cube face fills the
   * whole square), so a fresh atlas is generated before painting.
   */
  needsUnwrap: boolean
}

/** Starter meshes, so there is something to paint without importing a file. */
export const PRIMITIVES: PrimitiveDef[] = [
  { id: 'sphere', name: 'Sphere', create: () => new SphereGeometry(1, 128, 80), needsUnwrap: false },
  {
    id: 'rounded-cube',
    name: 'Rounded Cube',
    create: () => new RoundedBoxGeometry(1.5, 1.5, 1.5, 8, 0.16),
    needsUnwrap: true,
  },
  {
    id: 'cylinder',
    name: 'Cylinder',
    create: () => new CylinderGeometry(0.7, 0.7, 1.8, 96, 12),
    needsUnwrap: true,
  },
  { id: 'cone', name: 'Cone', create: () => new ConeGeometry(0.85, 1.8, 96, 16), needsUnwrap: true },
  { id: 'capsule', name: 'Capsule', create: () => new CapsuleGeometry(0.55, 1.1, 24, 64), needsUnwrap: false },
  { id: 'torus', name: 'Torus', create: () => new TorusGeometry(0.8, 0.34, 64, 128), needsUnwrap: false },
  {
    id: 'torus-knot',
    name: 'Torus Knot',
    create: () => new TorusKnotGeometry(0.7, 0.24, 320, 48),
    needsUnwrap: false,
  },
  { id: 'plane', name: 'Plane', create: () => new PlaneGeometry(2, 2, 1, 1), needsUnwrap: false },
]
