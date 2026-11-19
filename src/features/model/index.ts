import { defineFeature } from '@/core/app/feature'
import { pickFiles } from '@/core/utils/download'
import { formatKeys } from '@/features/shortcuts'
import { MODEL_ACCEPT } from './loaders'
import { ModelService } from './ModelService'
import { PRIMITIVES } from './primitives'
import { BusyOverlay, DropZone } from './ui/ModelOverlays'

declare module '@/core/app/services' {
  interface ServiceMap {
    model: ModelService
  }
}

/** Model import (glTF, OBJ, FBX, STL, PLY), drag-and-drop, and starter primitives. */
export const modelFeature = defineFeature({
  id: 'model',
  setup(ctx) {
    const model = new ModelService(ctx)
    ctx.services.register('model', model)

    const openFile = async () => {
      const [file] = await pickFiles(MODEL_ACCEPT)
      if (file) await model.openFile(file)
    }

    ctx.ui.registerMenuItem({
      id: 'file.open',
      menu: 'file',
      label: 'Open Model…',
      shortcut: formatKeys('mod+o'),
      order: 10,
      section: 'open',
      run: openFile,
    })
    PRIMITIVES.forEach((primitive, index) => {
      ctx.ui.registerMenuItem({
        id: `file.new.${primitive.id}`,
        menu: 'file',
        label: `New ${primitive.name}`,
        order: 20 + index,
        section: 'primitives',
        run: () => void model.openPrimitive(primitive.id),
      })
    })
    ctx.services.get('shortcuts').register({
      id: 'file.open',
      keys: 'mod+o',
      label: 'Open model',
      group: 'File',
      run: openFile,
    })

    ctx.ui.registerWidget({ id: 'model-busy', slot: 'viewport', order: 100, component: BusyOverlay })
    ctx.ui.registerWidget({ id: 'model-drop', slot: 'overlay', order: 10, component: DropZone })

    ctx.events.on('project:regenerateUVsRequested', () => void model.regenerateUVs())
  },
})

export type { ModelService } from './ModelService'
