import { ViewportHost } from '@/features/viewport'
import { Toasts } from '@/shared/ui/overlays'
import { Rail, Shelf, SidePanel, StatusBar, TopBar, WidgetSlot } from './layout/Shell'

/**
 * The application frame. It knows nothing about painting, layers or lighting:
 * every panel, tool, menu entry and dialog is contributed by a feature through
 * the UI registry (see src/core/app/UiRegistry.ts).
 */
export function App() {
  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <Rail />
        <SidePanel slot="left" width={288} />
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1">
            <ViewportHost />
            <WidgetSlot slot="viewport" />
          </div>
          <Shelf />
        </main>
        <SidePanel slot="right" width={312} />
      </div>
      <StatusBar />
      <WidgetSlot slot="overlay" />
      <Toasts />
    </div>
  )
}
