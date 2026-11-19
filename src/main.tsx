import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/app/App'
import { createApp, type App as AppInstance } from '@/app/bootstrap'
import { AppProvider } from '@/core/app/react'
import '@/app/styles.css'

const root = createRoot(document.getElementById('root')!)

let app: AppInstance | null = null
try {
  app = createApp()
} catch (error) {
  console.error(error)
  root.render(
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="text-[16px] font-semibold">W-Painter could not start</h1>
      <p className="max-w-md leading-relaxed text-fg-dim">
        This app needs WebGL 2 with float render targets. Try a recent version of Chrome, Edge, Firefox or
        Safari with hardware acceleration enabled.
      </p>
      <pre className="max-w-xl overflow-auto rounded-md bg-raised p-3 text-left text-[11px] text-fg-faint">
        {error instanceof Error ? error.message : String(error)}
      </pre>
    </div>,
  )
}

if (app) {
  if (import.meta.env.DEV) {
    // Handy for poking at services from the console and for smoke tests.
    ;(window as unknown as { wpainter: AppInstance }).wpainter = app
  }
  root.render(
    <StrictMode>
      <AppProvider app={app}>
        <App />
      </AppProvider>
    </StrictMode>,
  )
  // Start with something paintable on screen.
  void app.services.get('model').openPrimitive('sphere')
}
