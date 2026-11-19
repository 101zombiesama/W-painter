import { Mesh, MeshStandardMaterial, type BufferGeometry, type Object3D } from 'three'
import type { UvOrigin } from '@/features/project/TextureSet'

export interface LoadedModel {
  root: Object3D
  /** glTF puts v = 0 at the top of the image; most other formats at the bottom. */
  uvOrigin: UvOrigin
}

export const MODEL_EXTENSIONS = ['glb', 'gltf', 'obj', 'fbx', 'stl', 'ply'] as const
export const MODEL_ACCEPT = MODEL_EXTENSIONS.map((ext) => `.${ext}`).join(',')

export function isModelFile(file: File): boolean {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  return (MODEL_EXTENSIONS as readonly string[]).includes(extension)
}

function wrap(geometry: BufferGeometry): Object3D {
  return new Mesh(geometry, new MeshStandardMaterial())
}

/**
 * Parses a model file. Loaders are imported on demand so their code is only
 * downloaded for the formats a user actually opens.
 */
export async function loadModelFile(file: File): Promise<LoadedModel> {
  const extension = file.name.split('.').pop()?.toLowerCase()
  switch (extension) {
    case 'glb':
    case 'gltf': {
      const [{ GLTFLoader }, { DRACOLoader }, { MeshoptDecoder }] = await Promise.all([
        import('three/addons/loaders/GLTFLoader.js'),
        import('three/addons/loaders/DRACOLoader.js'),
        import('three/addons/libs/meshopt_decoder.module.js'),
      ])
      // DRACOLoader locates its bundled WASM decoder on its own.
      const draco = new DRACOLoader()
      const loader = new GLTFLoader().setDRACOLoader(draco).setMeshoptDecoder(MeshoptDecoder)
      try {
        const gltf = await loader.parseAsync(await file.arrayBuffer(), '')
        return { root: gltf.scene, uvOrigin: 'top-left' }
      } finally {
        draco.dispose()
      }
    }
    case 'obj': {
      const { OBJLoader } = await import('three/addons/loaders/OBJLoader.js')
      return { root: new OBJLoader().parse(await file.text()), uvOrigin: 'bottom-left' }
    }
    case 'fbx': {
      const { FBXLoader } = await import('three/addons/loaders/FBXLoader.js')
      return { root: new FBXLoader().parse(await file.arrayBuffer(), ''), uvOrigin: 'bottom-left' }
    }
    case 'stl': {
      const { STLLoader } = await import('three/addons/loaders/STLLoader.js')
      return { root: wrap(new STLLoader().parse(await file.arrayBuffer())), uvOrigin: 'bottom-left' }
    }
    case 'ply': {
      const { PLYLoader } = await import('three/addons/loaders/PLYLoader.js')
      return { root: wrap(new PLYLoader().parse(await file.arrayBuffer())), uvOrigin: 'bottom-left' }
    }
    default:
      throw new Error(`Unsupported file type ".${extension}". Supported: ${MODEL_EXTENSIONS.join(', ')}.`)
  }
}
