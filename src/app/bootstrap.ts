import type { AppContext } from '@/core/app/feature'
import { ServiceContainer } from '@/core/app/services'
import { UiRegistry } from '@/core/app/UiRegistry'
import { EventBus } from '@/core/events/EventBus'
import { History } from '@/core/history/History'
import { DisposableStore } from '@/core/utils/disposable'
import { FEATURES } from '@/features'

export interface App extends AppContext {
  dispose(): void
}

/**
 * Composition root: builds the shared kernel and lets every feature plug
 * itself in. Nothing else in the codebase constructs services.
 */
export function createApp(): App {
  const disposables = new DisposableStore()
  const context: AppContext = {
    services: new ServiceContainer(),
    events: new EventBus(),
    history: new History(),
    ui: new UiRegistry(),
  }
  for (const feature of FEATURES) {
    const teardown = feature.setup(context)
    if (teardown) disposables.add(teardown)
  }
  return { ...context, dispose: () => disposables.dispose() }
}
