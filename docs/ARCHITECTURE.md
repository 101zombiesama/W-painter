# Architecture

W-Painter is split into a small **kernel** (`src/core`), a set of independent **features**
(`src/features`), and a **shell** (`src/app`) that only arranges what features contribute.
The goal: adding a feature means adding a folder and one line, not editing existing code.

## The three layers

```
app/        Shell. Renders slots (rail, side panels, shelf, top bar). Knows no feature.
features/   Everything the product does. Each registers services and UI contributions.
core/       Service container, event bus, undo history, UI registry, GPU helpers.
shared/     Stateless UI components (Slider, Section, Dialog, ...).
```

Dependencies point downward only: `features → core/shared`, `app → features/core`.
`core` and `shared` never import from `features`.

## Feature modules

Every feature exports one module from its `index.ts`:

```ts
export const lightingFeature = defineFeature({
  id: 'lighting',
  setup(ctx) {
    const lighting = new LightingService(ctx)
    ctx.services.register('lighting', lighting)          // offer a service
    ctx.ui.registerPanel({ id: 'lighting', slot: 'right', ... })  // contribute UI
    return lighting                                       // disposed on teardown
  },
})
```

`src/features/index.ts` lists all features in setup order. A feature may use the services of
features listed before it. That list is the only place features are wired together.

### Current features and what they depend on

| Feature     | Provides                                                        | Uses                         |
| ----------- | --------------------------------------------------------------- | ---------------------------- |
| `shortcuts` | Keyboard shortcut registry, help dialog                         | —                            |
| `viewport`  | Renderer, scene, camera, frame loop, pointer gestures, picking  | —                            |
| `project`   | Texture sets, channels, surface maps, view modes                | viewport                     |
| `layers`    | Layer stacks, masks, compositor, stroke preview/bake            | project, viewport            |
| `paint`     | Brush engine, tools, brush/material state                       | layers, project, viewport    |
| `assets`    | Alphas, stamps, material and brush presets (shelf)              | paint, layers, project       |
| `lighting`  | Environments, key light, exposure, tone mapping                 | viewport                     |
| `uv`        | UV analysis, auto-unwrap worker                                 | —                            |
| `model`     | File import, primitives, drag and drop                          | project, uv                  |
| `export`    | PNG/zip texture export                                          | project, viewport            |
| `history`   | Undo/redo buttons, menu entries and shortcuts                   | shortcuts                    |

Most features also register key bindings with `shortcuts`, which is why it is set up first.

## Design patterns in use

| Pattern                 | Where                                                | Why                                                         |
| ----------------------- | ---------------------------------------------------- | ----------------------------------------------------------- |
| Composition root        | `app/bootstrap.ts`                                   | One place constructs everything; easy to reason about boot  |
| Service locator (typed) | `core/app/services.ts`                               | Features find each other without import cycles              |
| Declaration merging     | `ServiceMap`, `AppEvents`                            | A feature adds its service/event types from its own folder  |
| Registry / extension points | `core/app/UiRegistry.ts`, `ShortcutService`, `CHANNELS` | New panels, shortcuts, channels without touching the shell |
| Command                 | `core/history`, `layers/commands.ts`                 | Undo/redo                                                   |
| Memento                 | `LayerStackCommand`                                  | Layer edits undo by restoring an immutable snapshot         |
| Observer                | `EventBus`, zustand stores                           | Decoupled notifications; UI re-renders on state change      |
| Strategy                | UV unwrap methods, blend modes, brush tips           | Swap algorithms behind a stable interface                   |
| Dependency inversion    | `BrushTipProvider`, `LayerSource`                    | Low-level engines depend on interfaces, not on features     |

### State: stores vs. engine objects

- **Serializable state** (brush settings, layer stack, lighting) lives in zustand *vanilla* stores
  owned by services. React reads them with `useStore(service.store, selector)`.
- **GPU resources** (render targets, materials) live in plain classes and are never put in stores.
- The engine never depends on React. Engine code reads `store.getState()` when it needs a value
  (for example at the start of a stroke), so slider drags never re-render the viewport.

## Rendering and painting pipeline

Painting happens in **texture space**, not on the mesh:

```
pointer events
   │  resample into evenly spaced dabs (raycast against a BVH)
   ▼
PaintEngine ── queue of dabs ──► dab pass (≤16 dabs per pass)
                                   reads:  position map + normal map  (baked once per texture set)
                                   writes: stroke buffer (coverage, 16-bit float)
                                   │
                                   ▼
Compositor (once per frame, dirty rectangle only)
   for each dirty channel:  base value → blend layer 1 → … → blend layer N → output texture
   the active layer is blended together with the live stroke buffer
   then: pack AO/roughness/metallic → ORM,  height → normal map (Sobel)
                                   │
                                   ▼
three.js MeshStandardMaterial samples the output textures
```

On pointer-up the stroke buffer is **baked** into the layer's textures and an undo command
stores the previous pixels of the touched rectangle.

### Key pieces

- **`SurfaceMaps`** (`features/project`) bakes world position and normal per texel by rendering
  the mesh into its UV layout, then dilates both maps past island borders with jump flooding.
  Brushes test texels against these maps, so cost does not depend on polygon count and UV seams
  are painted on both sides automatically.
- **`TileGrid`** is a 32×32 UV-space grid storing the world bounds of the surface in each tile.
  It converts "these dabs" into "this rectangle of the texture" in microseconds. Every pass is
  scissored to that rectangle, which is what keeps 4K painting interactive.
- **`Compositor`** (`features/layers`) keeps a dirty channel set and rectangle per texture set and
  flushes once per frame. It never writes to layer textures.
- **`LayerTextures`** allocates a (value, alpha) texture per layer *per painted channel*, lazily.
- **`GpuContext`** (`core/gpu`) wraps full-screen passes, rect copies and read-back.
- **Render on demand**: the viewport only draws when something changed.

### Color handling

- Base color and emissive are stored **sRGB-encoded** in 8-bit layers and blended in that space
  (like image editors). Their output textures are `SRGB8_ALPHA8`, so the GPU decodes when the
  material samples them.
- Roughness, metallic and AO are linear 8-bit. Height is 16-bit float in the range −1…1.

## How to…

### Add a feature
1. Create `src/features/<name>/index.ts` exporting `defineFeature({ id, setup })`.
2. If it offers a service, add it to `ServiceMap` via `declare module '@/core/app/services'`.
3. Register UI with `ctx.ui.registerPanel / registerShelfTab / registerMenuItem / registerWidget`.
4. Add the module to `FEATURES` in `src/features/index.ts`, after the features it uses.

### Add a material channel
Add an entry to `CHANNELS` in `features/project/channels.ts` and bind its output to the viewport
material in `TextureSet.allocate`. Layers, brush UI, compositing and fill layers pick it up from
the registry. Add an export entry in `features/export/ExportService.ts` if it should be exportable.

### Add a blend mode
Append it to `BLEND_MODES` in `features/layers/types.ts` and add the matching branch to
`blendColors` in `features/layers/shaders/glsl.ts` (the array index is the shader's mode id).

### Add a brush tip, stamp, material or brush preset
Add an entry to `features/assets/generators.ts` or `features/assets/presets.ts`.

### Add a tool
Add its id to `ToolId` (`features/paint/store.ts`), list it in `TOOLS`
(`features/paint/ui/ToolRail.tsx`), and handle it in `PaintEngine.begin`. A tool with very
different behavior can instead register its own gesture handler with
`viewport.addGestureHandler(handler, priority)`.

### Add a UV unwrap method
Implement it in the worker (`features/uv/unwrap.worker.ts`) and extend `UnwrapMethod`.

### Make an action undoable
Push a `Command` to `ctx.history`. For layer state, go through `LayerService` (its `mutate`
helper records a memento). For pixels, use `capturePatch` + `TexturePatchCommand`.

## Conventions

- TypeScript strict, `erasableSyntaxOnly` (no enums, no constructor parameter properties).
- Import across features through the path alias: `@/features/<name>/...`.
- Shaders are GLSL ES 3.00 template strings next to the code that uses them.
- Engine classes own their GPU resources and expose `dispose()`.
- User-facing failures go through `notify()` (toasts), not `alert`.

## Testing

- `npm test` — unit tests for pure logic (history, rect math, tile culling, box unwrap).
- `npm run smoke` — drives the real app in headless Chrome with pointer input and checks
  painting, undo, layers, masks, auto-UVs, import, export and lighting. It fails on any console
  error. Look at `scripts/.out/*.png` after a run to review the result visually.
