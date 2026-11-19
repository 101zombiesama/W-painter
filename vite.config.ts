import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    // three.js is already ESM. Pre-bundling it would (a) reload the page the first
    // time a lazily imported loader or the UV worker is used, and (b) break the
    // import.meta.url-relative paths DRACOLoader uses to find its WASM decoder.
    exclude: ['three'],
  },
  server: {
    port: 5173,
  },
  build: {
    target: 'es2023',
    chunkSizeWarningLimit: 1200,
  },
})
