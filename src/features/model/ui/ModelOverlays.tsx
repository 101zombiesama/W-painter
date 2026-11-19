import { FileUp, LoaderCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useStore } from 'zustand'
import { useService } from '@/core/app/react'
import { notify } from '@/shared/ui/toast'
import { isModelFile, MODEL_EXTENSIONS } from '../loaders'

/** Blocks the viewport with a progress card while a model loads or unwraps. */
export function BusyOverlay() {
  const project = useService('project')
  const busy = useStore(project.store, (state) => state.busy)
  if (!busy) return null
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-app/60 backdrop-blur-[2px]">
      <div
        role="status"
        className="flex items-center gap-3 rounded-lg border border-line-strong bg-panel px-4 py-3 shadow-2xl shadow-black/60"
      >
        <LoaderCircle size={16} className="text-accent" style={{ animation: 'spin 0.9s linear infinite' }} />
        <span className="text-[12px] text-fg">{busy}</span>
      </div>
    </div>
  )
}

/** Lets the user drop a model file anywhere in the window to open it. */
export function DropZone() {
  const model = useService('model')
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    let depth = 0
    const hasFiles = (event: DragEvent) => event.dataTransfer?.types.includes('Files') ?? false

    const onDragEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return
      depth += 1
      setDragging(true)
    }
    const onDragLeave = (event: DragEvent) => {
      if (!hasFiles(event)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragging(false)
    }
    const onDragOver = (event: DragEvent) => {
      if (hasFiles(event)) event.preventDefault()
    }
    const onDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      depth = 0
      setDragging(false)
      const file = Array.from(event.dataTransfer?.files ?? []).find(isModelFile)
      if (file) void model.openFile(file)
      else notify(`Drop a 3D model file (${MODEL_EXTENSIONS.join(', ')}).`, 'warning')
    }

    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [model])

  if (!dragging) return null
  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-app/70 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-accent px-14 py-10">
        <FileUp size={30} className="text-accent" />
        <span className="text-[14px] font-semibold">Drop to open model</span>
        <span className="text-fg-dim">{MODEL_EXTENSIONS.map((ext) => `.${ext}`).join('  ')}</span>
      </div>
    </div>
  )
}
