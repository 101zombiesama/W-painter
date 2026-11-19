import { createStore, type StoreApi } from 'zustand/vanilla'

/** An undoable unit of work (Command pattern). */
export interface Command {
  readonly label: string
  undo(): void
  redo(): void
  /** Approximate memory retained by this command (CPU or GPU), in bytes. */
  readonly bytes?: number
  /** Called once when the command can never be undone/redone again. */
  dispose?(): void
}

export interface HistoryState {
  canUndo: boolean
  canRedo: boolean
  undoLabel: string | null
  redoLabel: string | null
  /** Increments on every change; handy as a cheap subscription key. */
  revision: number
}

export interface HistoryOptions {
  maxEntries?: number
  maxBytes?: number
}

/**
 * Linear undo/redo stack with an entry cap and a memory budget, so texture
 * snapshots from long painting sessions cannot grow without bound.
 */
export class History {
  readonly store: StoreApi<HistoryState> = createStore<HistoryState>(() => ({
    canUndo: false,
    canRedo: false,
    undoLabel: null,
    redoLabel: null,
    revision: 0,
  }))

  private readonly undoStack: Command[] = []
  private readonly redoStack: Command[] = []
  private readonly maxEntries: number
  private readonly maxBytes: number
  private readonly evictionListeners = new Set<() => void>()

  constructor(options: HistoryOptions = {}) {
    this.maxEntries = options.maxEntries ?? 200
    this.maxBytes = options.maxBytes ?? 512 * 1024 * 1024
  }

  /** Records a command that has already been applied. */
  push(command: Command): void {
    for (const stale of this.redoStack) stale.dispose?.()
    this.redoStack.length = 0
    this.undoStack.push(command)
    this.trim()
    this.sync()
    this.notifyEviction()
  }

  undo(): boolean {
    const command = this.undoStack.pop()
    if (!command) return false
    command.undo()
    this.redoStack.push(command)
    this.sync()
    return true
  }

  redo(): boolean {
    const command = this.redoStack.pop()
    if (!command) return false
    command.redo()
    this.undoStack.push(command)
    this.sync()
    return true
  }

  clear(): void {
    for (const command of this.undoStack) command.dispose?.()
    for (const command of this.redoStack) command.dispose?.()
    this.undoStack.length = 0
    this.redoStack.length = 0
    this.sync()
    this.notifyEviction()
  }

  /** All commands that can still be undone or redone. */
  entries(): readonly Command[] {
    return [...this.undoStack, ...this.redoStack]
  }

  /** Fires after commands were dropped (trimmed, cleared, or redo branch cut). */
  onEviction(listener: () => void): () => void {
    this.evictionListeners.add(listener)
    return () => this.evictionListeners.delete(listener)
  }

  private trim(): void {
    let bytes = 0
    for (const command of this.undoStack) bytes += command.bytes ?? 0
    while (
      this.undoStack.length > 1 &&
      (this.undoStack.length > this.maxEntries || bytes > this.maxBytes)
    ) {
      const dropped = this.undoStack.shift()!
      bytes -= dropped.bytes ?? 0
      dropped.dispose?.()
    }
  }

  private notifyEviction(): void {
    for (const listener of this.evictionListeners) listener()
  }

  private sync(): void {
    const undo = this.undoStack[this.undoStack.length - 1]
    const redo = this.redoStack[this.redoStack.length - 1]
    this.store.setState((s) => ({
      canUndo: undo !== undefined,
      canRedo: redo !== undefined,
      undoLabel: undo?.label ?? null,
      redoLabel: redo?.label ?? null,
      revision: s.revision + 1,
    }))
  }
}
