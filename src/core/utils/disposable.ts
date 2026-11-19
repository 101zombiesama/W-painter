export interface Disposable {
  dispose(): void
}

export type Teardown = Disposable | (() => void)

/** Collects teardown callbacks so a feature can release everything in one call. */
export class DisposableStore implements Disposable {
  private readonly items: Teardown[] = []
  private disposed = false

  add<T extends Teardown>(item: T): T {
    if (this.disposed) {
      runTeardown(item)
    } else {
      this.items.push(item)
    }
    return item
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    // Reverse order: later registrations may depend on earlier ones.
    for (let i = this.items.length - 1; i >= 0; i--) runTeardown(this.items[i])
    this.items.length = 0
  }
}

function runTeardown(item: Teardown): void {
  if (typeof item === 'function') item()
  else item.dispose()
}
