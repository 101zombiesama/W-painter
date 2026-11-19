import { createStore, type StoreApi } from 'zustand/vanilla'

export interface Shortcut {
  id: string
  /**
   * Key combination such as `mod+z`, `mod+shift+z`, `b` or `[`.
   * `mod` is Cmd on macOS and Ctrl elsewhere.
   */
  keys: string
  label: string
  group: string
  run(): void
  /** Fire repeatedly while the key is held (e.g. brush size). */
  repeat?: boolean
}

export interface ShortcutState {
  shortcuts: Shortcut[]
  helpOpen: boolean
}

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

/** Formats a key combination for display, e.g. `mod+shift+z` -> `⌘⇧Z`. */
export function formatKeys(keys: string): string {
  return keys
    .split('+')
    .map((part) => {
      if (part === 'mod') return IS_MAC ? '⌘' : 'Ctrl+'
      if (part === 'shift') return IS_MAC ? '⇧' : 'Shift+'
      if (part === 'alt') return IS_MAC ? '⌥' : 'Alt+'
      return part.length === 1 ? part.toUpperCase() : part
    })
    .join('')
}

function eventToKeys(event: KeyboardEvent): string {
  const parts: string[] = []
  if (IS_MAC ? event.metaKey : event.ctrlKey) parts.push('mod')
  if (event.shiftKey) parts.push('shift')
  if (event.altKey) parts.push('alt')
  // Use the physical key for letters and digits so Shift/Alt don't change them.
  let key = event.key.toLowerCase()
  if (event.code.startsWith('Key')) key = event.code.slice(3).toLowerCase()
  else if (event.code.startsWith('Digit')) key = event.code.slice(5)
  parts.push(key)
  return parts.join('+')
}

function isTextInput(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true
  if (target instanceof HTMLInputElement) {
    return !['checkbox', 'radio', 'range', 'button', 'color'].includes(target.type)
  }
  return false
}

/** Global keyboard shortcuts. Features register their own bindings at setup. */
export class ShortcutService {
  readonly store: StoreApi<ShortcutState> = createStore<ShortcutState>(() => ({
    shortcuts: [],
    helpOpen: false,
  }))

  constructor() {
    window.addEventListener('keydown', this.onKeyDown)
  }

  register(shortcut: Shortcut): void {
    this.store.setState((state) => ({
      shortcuts: [...state.shortcuts.filter((s) => s.id !== shortcut.id), shortcut],
    }))
  }

  setHelpOpen(helpOpen: boolean): void {
    this.store.setState({ helpOpen })
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown)
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (isTextInput(event.target)) return
    const keys = eventToKeys(event)
    const shortcut = this.store.getState().shortcuts.find((s) => s.keys === keys)
    if (!shortcut) return
    if (event.repeat && !shortcut.repeat) {
      event.preventDefault()
      return
    }
    event.preventDefault()
    shortcut.run()
  }
}
