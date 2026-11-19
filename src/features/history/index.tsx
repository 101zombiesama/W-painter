import { Redo2, Undo2 } from 'lucide-react'
import { defineFeature } from '@/core/app/feature'
import { useApp, useHistoryState } from '@/core/app/react'
import { formatKeys } from '@/features/shortcuts'
import { IconButton } from '@/shared/ui/controls'

function UndoRedoButtons() {
  const { history } = useApp()
  const canUndo = useHistoryState((state) => state.canUndo)
  const canRedo = useHistoryState((state) => state.canRedo)
  const undoLabel = useHistoryState((state) => state.undoLabel)
  const redoLabel = useHistoryState((state) => state.redoLabel)
  return (
    <div className="flex items-center">
      <IconButton
        icon={Undo2}
        label={undoLabel ? `Undo ${undoLabel} (${formatKeys('mod+z')})` : 'Nothing to undo'}
        disabled={!canUndo}
        onClick={() => history.undo()}
      />
      <IconButton
        icon={Redo2}
        label={redoLabel ? `Redo ${redoLabel} (${formatKeys('mod+shift+z')})` : 'Nothing to redo'}
        disabled={!canRedo}
        onClick={() => history.redo()}
      />
    </div>
  )
}

/** Undo/redo controls for the shared command history. */
export const historyFeature = defineFeature({
  id: 'history',
  setup(ctx) {
    const { history } = ctx
    const shortcuts = ctx.services.get('shortcuts')
    shortcuts.register({ id: 'edit.undo', keys: 'mod+z', label: 'Undo', group: 'Edit', repeat: true, run: () => history.undo() })
    shortcuts.register({ id: 'edit.redo', keys: 'mod+shift+z', label: 'Redo', group: 'Edit', repeat: true, run: () => history.redo() })
    shortcuts.register({ id: 'edit.redo-alt', keys: 'mod+y', label: 'Redo (alternate)', group: 'Edit', repeat: true, run: () => history.redo() })

    ctx.ui.registerMenuItem({ id: 'edit.undo', menu: 'edit', label: 'Undo', shortcut: formatKeys('mod+z'), order: 10, section: 'history', run: () => history.undo() })
    ctx.ui.registerMenuItem({ id: 'edit.redo', menu: 'edit', label: 'Redo', shortcut: formatKeys('mod+shift+z'), order: 20, section: 'history', run: () => history.redo() })
    ctx.ui.registerWidget({ id: 'undo-redo', slot: 'topbar', order: 0, component: UndoRedoButtons })

    // Projects are not saved yet, so at least warn before a reload throws work away.
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (history.store.getState().canUndo) event.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  },
})
