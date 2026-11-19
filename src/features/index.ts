import type { FeatureModule } from '@/core/app/feature'
import { assetsFeature } from './assets'
import { exportFeature } from './export'
import { historyFeature } from './history'
import { layersFeature } from './layers'
import { lightingFeature } from './lighting'
import { modelFeature } from './model'
import { paintFeature } from './paint'
import { projectFeature } from './project'
import { shortcutsFeature } from './shortcuts'
import { uvFeature } from './uv'
import { viewportFeature } from './viewport'

/**
 * Every feature of the app, in setup order. A feature may use the services
 * of the features listed before it.
 *
 * To add a feature: create `src/features/<name>/index.ts` exporting a
 * `defineFeature({...})` module and add it to this list.
 */
export const FEATURES: readonly FeatureModule[] = [
  shortcutsFeature, // keyboard registry: used by almost everything below
  viewportFeature, // renderer, camera, frame loop, pointer routing
  projectFeature, // texture sets and their flattened outputs
  layersFeature, // layer stacks + compositor
  paintFeature, // brushes and tools
  assetsFeature, // shelf: alphas, stamps, presets
  lightingFeature, // environment, key light, tone mapping
  uvFeature, // UV analysis and auto-unwrap
  modelFeature, // import and primitives
  exportFeature, // texture export
  historyFeature, // undo/redo UI
]
