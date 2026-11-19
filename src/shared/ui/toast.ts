import { createStore } from 'zustand/vanilla'

export type ToastKind = 'info' | 'success' | 'warning' | 'error'

export interface Toast {
  id: number
  message: string
  kind: ToastKind
}

interface ToastState {
  toasts: Toast[]
}

export const toastStore = createStore<ToastState>(() => ({ toasts: [] }))

let nextId = 1

/** Shows a transient message. Callable from anywhere, including engine code. */
export function notify(message: string, kind: ToastKind = 'info', durationMs = 4200): void {
  const { toasts } = toastStore.getState()
  // Repeated identical messages (e.g. clicking a locked layer) just refresh.
  if (toasts.some((toast) => toast.message === message)) return
  const id = nextId++
  toastStore.setState({ toasts: [...toasts.slice(-3), { id, message, kind }] })
  window.setTimeout(() => dismissToast(id), durationMs)
}

export function dismissToast(id: number): void {
  toastStore.setState((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }))
}
