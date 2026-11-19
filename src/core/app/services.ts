/**
 * Typed service registry. Each feature contributes its services through
 * declaration merging, so there is no central file to edit when adding one:
 *
 *   declare module '@/core/app/services' {
 *     interface ServiceMap { viewport: ViewportService }
 *   }
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ServiceMap {}

export type ServiceKey = keyof ServiceMap

export class ServiceContainer {
  private readonly services = new Map<string, unknown>()

  register<K extends ServiceKey>(key: K, service: ServiceMap[K]): ServiceMap[K] {
    if (this.services.has(key)) {
      throw new Error(`Service "${key}" is already registered`)
    }
    this.services.set(key, service)
    return service
  }

  get<K extends ServiceKey>(key: K): ServiceMap[K] {
    const service = this.services.get(key)
    if (service === undefined) {
      throw new Error(
        `Service "${key}" is not registered. Check the feature order in src/features/index.ts.`,
      )
    }
    return service as ServiceMap[K]
  }

  has(key: ServiceKey): boolean {
    return this.services.has(key)
  }
}
