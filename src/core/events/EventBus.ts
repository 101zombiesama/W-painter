/**
 * Application-wide event map. Features extend it through declaration merging:
 *
 *   declare module '@/core/events/EventBus' {
 *     interface AppEvents { 'paint:strokeEnd': { textureSetId: string } }
 *   }
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface AppEvents {}

type Handler<T> = (payload: T) => void

/** Minimal typed publish/subscribe hub for cross-feature notifications. */
export class EventBus<E extends object = AppEvents> {
  private readonly handlers = new Map<keyof E, Set<Handler<never>>>()

  /** Subscribes to an event. Returns an unsubscribe function. */
  on<K extends keyof E>(type: K, handler: Handler<E[K]>): () => void {
    let set = this.handlers.get(type)
    if (!set) {
      set = new Set()
      this.handlers.set(type, set)
    }
    set.add(handler as Handler<never>)
    return () => {
      set.delete(handler as Handler<never>)
    }
  }

  emit<K extends keyof E>(type: K, payload: E[K]): void {
    const set = this.handlers.get(type)
    if (!set) return
    for (const handler of [...set]) (handler as Handler<E[K]>)(payload)
  }
}
