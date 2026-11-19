import { createContext, useContext, type ReactNode } from 'react'
import { useStore } from 'zustand'
import type { AppContext } from './feature'
import type { ServiceKey, ServiceMap } from './services'
import type { UiRegistryState } from './UiRegistry'
import type { HistoryState } from '@/core/history/History'

const Context = createContext<AppContext | null>(null)

export function AppProvider({ app, children }: { app: AppContext; children: ReactNode }) {
  return <Context.Provider value={app}>{children}</Context.Provider>
}

export function useApp(): AppContext {
  const app = useContext(Context)
  if (!app) throw new Error('useApp must be used inside <AppProvider>')
  return app
}

/** Access an engine service from a React component. */
export function useService<K extends ServiceKey>(key: K): ServiceMap[K] {
  return useApp().services.get(key)
}

/** Subscribe to UI contributions (panels, tools, menu items...). */
export function useUi<T>(selector: (state: UiRegistryState) => T): T {
  return useStore(useApp().ui.store, selector)
}

export function useHistoryState<T>(selector: (state: HistoryState) => T): T {
  return useStore(useApp().history.store, selector)
}
