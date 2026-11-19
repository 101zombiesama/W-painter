import type { EventBus } from '@/core/events/EventBus'
import type { History } from '@/core/history/History'
import type { Teardown } from '@/core/utils/disposable'
import type { ServiceContainer } from './services'
import type { UiRegistry } from './UiRegistry'

/** Everything a feature needs to plug itself into the application. */
export interface AppContext {
  readonly services: ServiceContainer
  readonly events: EventBus
  readonly history: History
  readonly ui: UiRegistry
}

/**
 * A self-contained slice of the app. `setup` runs once at boot, in the order
 * listed in `src/features/index.ts`. A feature may:
 *  - register services for other features (`ctx.services.register`)
 *  - consume services registered by earlier features (`ctx.services.get`)
 *  - contribute UI (`ctx.ui.registerPanel`, `registerTool`, ...)
 */
export interface FeatureModule {
  readonly id: string
  setup(ctx: AppContext): Teardown | void
}

export function defineFeature(feature: FeatureModule): FeatureModule {
  return feature
}
