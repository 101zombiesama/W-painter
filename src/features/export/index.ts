import { defineFeature } from '@/core/app/feature'
import { formatKeys } from '@/features/shortcuts'
import { ExportService } from './ExportService'
import { ExportButton, ExportDialog } from './ui/ExportDialog'

declare module '@/core/app/services' {
  interface ServiceMap {
    export: ExportService
  }
}

/** Texture export to PNG (separate maps or packed ORM, OpenGL/DirectX normals). */
export const exportFeature = defineFeature({
  id: 'export',
  setup(ctx) {
    const exporter = new ExportService(ctx)
    ctx.services.register('export', exporter)

    ctx.ui.registerWidget({ id: 'export-button', slot: 'topbar', order: 90, component: ExportButton })
    ctx.ui.registerWidget({ id: 'export-dialog', slot: 'overlay', order: 20, component: ExportDialog })
    ctx.ui.registerMenuItem({
      id: 'file.export',
      menu: 'file',
      label: 'Export Textures…',
      shortcut: formatKeys('mod+shift+e'),
      order: 90,
      section: 'export',
      run: () => exporter.openDialog(),
    })
    ctx.services.get('shortcuts').register({
      id: 'file.export',
      keys: 'mod+shift+e',
      label: 'Export textures',
      group: 'File',
      run: () => exporter.openDialog(),
    })
    return exporter
  },
})

export type { ExportService } from './ExportService'
