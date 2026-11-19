import { defineFeature } from '@/core/app/feature'
import { UvService } from './UvService'

declare module '@/core/app/services' {
  interface ServiceMap {
    uv: UvService
  }
}

/** UV analysis and automatic unwrapping for meshes without usable UVs. */
export const uvFeature = defineFeature({
  id: 'uv',
  setup(ctx) {
    ctx.services.register('uv', new UvService())
  },
})

export type { UnwrapResult, UvAnalysis, UvService } from './UvService'
