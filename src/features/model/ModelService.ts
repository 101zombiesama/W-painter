import { Mesh, MeshStandardMaterial, type BufferGeometry } from 'three'
import type { AppContext } from '@/core/app/feature'
import type { ModelPart, ProjectService } from '@/features/project/ProjectService'
import type { UvOrigin } from '@/features/project/TextureSet'
import type { UvService } from '@/features/uv'
import { notify } from '@/shared/ui/toast'
import { loadModelFile } from './loaders'
import { extractParts, normalizeParts, type RawPart } from './prepare'
import { PRIMITIVES } from './primitives'

interface SourceModel {
  name: string
  uvOrigin: UvOrigin
  parts: RawPart[]
}

/**
 * Opens models: parses files or builds primitives, normalizes them, makes
 * sure every part has paintable UVs, and hands the result to the project.
 */
export class ModelService {
  private readonly project: ProjectService
  private readonly uv: UvService
  /** The model as imported (before any generated UVs), kept for re-unwrapping. */
  private source: SourceModel | null = null
  private loadToken = 0

  constructor(ctx: AppContext) {
    this.project = ctx.services.get('project')
    this.uv = ctx.services.get('uv')
  }

  async openFile(file: File): Promise<void> {
    await this.open(`Loading ${file.name}…`, async () => {
      const { root, uvOrigin } = await loadModelFile(file)
      const parts = extractParts(root)
      if (parts.length === 0) throw new Error('This file contains no meshes.')
      return { name: file.name.replace(/\.[^.]+$/, ''), uvOrigin, parts }
    })
  }

  async openPrimitive(id: string): Promise<void> {
    const primitive = PRIMITIVES.find((p) => p.id === id)
    if (!primitive) return
    await this.open(
      `Creating ${primitive.name}…`,
      async () => {
        const material = new MeshStandardMaterial({ name: primitive.name })
        const parts = extractParts(new Mesh(primitive.create(), material))
        return { name: primitive.name, uvOrigin: 'bottom-left' as const, parts }
      },
      primitive.needsUnwrap,
    )
  }

  /** Rebuilds the current model with freshly generated UVs. Painted work is discarded. */
  async regenerateUVs(): Promise<void> {
    const source = this.source
    if (!source) return
    await this.open('Generating UVs…', async () => source, true)
  }

  private async open(message: string, load: () => Promise<SourceModel>, forceUnwrap = false): Promise<void> {
    const token = ++this.loadToken
    this.project.setBusy(message)
    try {
      // Let the busy overlay paint before blocking work starts.
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
      const source = await load()
      if (source !== this.source) normalizeParts(source.parts)

      const parts: ModelPart[] = []
      let generated = 0
      let warnedOverlap = false
      for (const part of source.parts) {
        let geometry: BufferGeometry = part.geometry
        let generatedUVs = false
        const analysis = this.uv.analyze(geometry)

        if (!analysis.hasUVs || forceUnwrap) {
          this.project.setBusy(`Generating UVs for ${part.name}…`)
          const result = await this.uv.unwrap(geometry)
          geometry = result.geometry
          generatedUVs = true
          generated += 1
        } else {
          // Keep the source geometry intact so UVs can be regenerated later.
          geometry = geometry.clone()
          if ((analysis.overlapping || analysis.outOfRange) && !warnedOverlap) {
            warnedOverlap = true
            notify(
              analysis.overlapping
                ? 'This model has overlapping UVs, so paint will repeat across faces. Use Texture Sets → Regenerate UVs to fix it.'
                : 'Some UVs lie outside the 0–1 square and cannot be painted. Use Texture Sets → Regenerate UVs to fix it.',
              'warning',
              9000,
            )
          }
        }
        parts.push({ name: part.name, geometry, uvOrigin: generatedUVs ? 'bottom-left' : source.uvOrigin, generatedUVs })
      }

      if (token !== this.loadToken) return // A newer load superseded this one.
      this.source = source
      this.project.setModel({ name: source.name, parts })
      if (generated > 0) {
        notify(
          generated === 1 ? 'Generated a UV layout for this mesh.' : `Generated UV layouts for ${generated} parts.`,
          'success',
        )
      }
    } catch (error) {
      console.error(error)
      notify(error instanceof Error ? error.message : 'Could not open the model.', 'error', 7000)
    } finally {
      if (token === this.loadToken) this.project.setBusy(null)
    }
  }
}
