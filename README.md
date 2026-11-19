# W-Painter

A 3D PBR texture painter that runs in the browser. Load a model, paint base color, height
(real-time normals), roughness, metallic, emissive and AO directly on its surface, organize the
work in layers and masks, and export the textures.

Built with TypeScript, three.js (WebGL 2), React and Vite.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
```

The app opens with a sphere ready to paint. Use **File → Open Model…** or drop a file anywhere in
the window to load your own mesh (`.glb`, `.gltf`, `.obj`, `.fbx`, `.stl`, `.ply`).

| Script              | What it does                                                              |
| ------------------- | ------------------------------------------------------------------------- |
| `npm run dev`       | Dev server with hot reload                                                |
| `npm run build`     | Type-check and build to `dist/`                                           |
| `npm run typecheck` | Type-check only                                                           |
| `npm test`          | Unit tests (Vitest)                                                       |
| `npm run smoke`     | End-to-end check in headless Chrome; screenshots land in `scripts/.out/`  |

Requires a browser with WebGL 2 and float render targets (current Chrome, Edge, Firefox, Safari).
The smoke test uses a locally installed Chrome; set `CHROME_PATH` if it is somewhere unusual.

## What you can do today

- **Paint on the model** with a brush, eraser, stamp tool and material picker. One stroke writes
  every enabled channel at once (e.g. color + roughness + metallic + height).
- **Brushes**: size, flow, stroke opacity, hardness, spacing, angle; size/angle/flow jitter and
  scatter; follow-stroke rotation; pen pressure; stroke smoothing; surface or camera alignment;
  X/Y/Z symmetry. Textured tips ("alphas"), built in or imported.
- **Height → normals in real time**: paint height and see the surface emboss immediately.
- **Layers**: paint and fill layers, per-channel blend modes and opacity, masks you can paint,
  invert, disable or remove; reorder, duplicate, rename, hide.
- **UVs**: models without UVs (or with overlapping UVs) get an automatically generated atlas.
  The Texture Sets panel shows the layout.
- **Texture sets**: one per material of the model, each with its own layers and resolution
  (512–4096).
- **Lighting**: six built-in environments or your own `.hdr`/`.exr`, a key light with optional
  shadows, exposure and tone mapping.
- **Views**: lit material, or any single map (base color, height, normal, roughness, …).
- **Undo/redo** for strokes and layer edits.
- **Export** PNG maps (separate or packed ORM, OpenGL or DirectX normals) as a zip.

Not there yet: saving projects, a 2D/UV painting view, importing a model's existing textures.
See [docs/ROADMAP.md](docs/ROADMAP.md) for the full plan.

## Controls

| Input                                 | Action                          |
| ------------------------------------- | ------------------------------- |
| Drag on the model                     | Paint with the active tool      |
| Drag on empty space, Alt-drag, right-drag | Orbit                       |
| Middle-drag, Alt+Shift-drag           | Pan                             |
| Scroll                                | Zoom toward the cursor          |
| Shift + right-drag                    | Rotate the environment light    |
| `B` `E` `S` `I`                       | Brush, eraser, stamp, picker    |
| `[` `]`                               | Brush size                      |
| `L`                                   | Toggle symmetry                 |
| `X`                                   | Swap mask paint white/black     |
| `C` / `M`                             | Next channel view / material view |
| `F`                                   | Frame the model                 |
| `Cmd/Ctrl+Z`, `Cmd/Ctrl+Shift+Z`      | Undo, redo                      |
| `?`                                   | Show all shortcuts              |

## Project layout

```
src/
  app/         Shell: layout, bootstrap (composition root), styles
  core/        Kernel shared by all features: services, events, history, GPU helpers
  features/    One folder per feature (viewport, project, layers, paint, uv, lighting, ...)
  shared/      Reusable UI components
docs/          Architecture notes and roadmap
scripts/       Smoke test
BUILD_LOG.md   Running log of what was built, decided and verified
```

Start with [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) to understand how the pieces fit and how
to add a feature.
