# Build log

A running record of what was built, why, and how it was verified. Newest entry first.
Add an entry at the end of every working session.

---

## 2026-11-19 — v0.1.0: project setup and first paintable build

### Summary

Set up the project from an empty folder and built the first end-to-end version: import a model
(or pick a primitive), get UVs generated if needed, paint PBR channels in layers with brushes,
alphas and stamps, light it, and export the textures.

### Stack

| Choice | Version | Why |
| --- | --- | --- |
| Vite | 8.3 | Fast dev server, worker and lazy-chunk support out of the box |
| TypeScript | 7.0 (strict, `erasableSyntaxOnly`) | Requested; strictness catches GPU-plumbing mistakes early |
| three.js | r187 (WebGL 2 renderer) | Mature PBR, loaders, PMREM; ships a UV unwrapper |
| React | 19 | UI only; the engine does not depend on it |
| zustand | 5 | Small vanilla stores readable from both engine and UI |
| Tailwind CSS | 4 | Design tokens + utility classes, no component library |
| three-mesh-bvh | 0.9 | O(log n) brush raycasts |
| fflate, react-colorful, lucide-react | | Zip export, color picker, icons |
| Vitest, puppeteer-core | | Unit tests; headless smoke test using the installed Chrome |

### Built

- **Kernel** (`src/core`): typed service container, event bus, UI registry, command history with
  a memory budget, GPU pass helpers, render-target format table.
- **Viewport**: WebGL 2 renderer, render-on-demand loop, orbit/pan/zoom, gesture routing so tools
  get first refusal on pointer input, BVH picking with interpolated normals.
- **Project / texture sets**: one texture set per material; per-texel position and normal maps
  baked in UV space and dilated with jump flooding; a UV tile grid for dirty-rectangle culling;
  channel registry (base color, height, roughness, metallic, emissive, AO); view modes.
- **Layers**: paint and fill layers, masks, 8 blend modes, per-channel opacity, lazy storage,
  GPU compositor with live stroke preview, height → normal, ORM packing.
- **Paint**: brush, eraser, stamp, picker; batched dab shader (16 dabs per pass); spacing,
  jitter, scatter, pressure, smoothing, symmetry, surface/camera alignment; brush cursor.
- **Assets**: procedural alphas (12) and stamps (14), material presets (22), brush presets (12),
  image import for alphas and stamps.
- **UV**: analysis plus auto-unwrap in a web worker (LSCM atlas via three's `unwrapUVs`, with a
  box-projection fallback written for this project); UV layout preview.
- **Model**: GLB/glTF, OBJ, FBX, STL, PLY loaders (lazy-loaded), drag and drop, 8 primitives,
  world-space baking and normalization.
- **Lighting**: 6 procedural HDR environments, custom HDR/EXR, key light with shadows, exposure,
  tone mapping.
- **Export**: PNG maps and packed ORM as a zip, OpenGL/DirectX normals, UV-origin aware.
- **Shell**: top bar with menus, tool rail, tabbed side panels, asset shelf, status bar, toasts,
  dialogs, keyboard shortcut help.

About 10,600 lines across 86 source files.

### Key decisions

1. **Paint in texture space against baked position maps**, not by rasterizing the mesh per dab.
   Cost is independent of triangle count, seams need no special handling, and gutters are
   painted for free because the maps are dilated.
2. **Strokes accumulate into a separate coverage buffer** and are blended in by the compositor
   until pointer-up. This gives correct "stroke opacity vs. flow" behavior and makes
   multi-channel painting cost one dab pass regardless of how many channels are enabled.
3. **Scissor everything to a dirty rectangle** found through a CPU tile grid. This is what makes
   4K interactive on integrated GPUs.
4. **Base color is blended in sRGB space in 8 bits** (artist-expected behavior, no banding) and
   resolved into an sRGB texture for correct lighting.
5. **Layer state is immutable and serializable; pixels live elsewhere.** Layer undo is a
   snapshot swap; pixel undo stores only the touched rectangle.
6. **Features plug in through registries.** The shell has no knowledge of any feature.
7. **Tone mapping defaults to Khronos Neutral** so painted colors look like the picked color.
8. **three.js is excluded from Vite's dependency pre-bundling.** Otherwise the dev server reloads
   the page the first time a lazy loader or the UV worker runs, and DRACOLoader's WASM paths break.

### Verification

- `npm run typecheck` and `npm run build`: pass.
- `npm test`: 21 unit tests pass (history, rect math, tile culling, box unwrap).
- `npm run smoke` (headless Chrome, Apple M1, Metal): passes with no console errors. It covers
  painting color/metal/height, stamps, channel views, undo/redo of 4 strokes, resolution change
  to 4096, auto-unwrap of a rounded cube, fill layer + painted mask with a textured tip, eraser,
  symmetry, layer duplicate/move/delete with undo, material picker, environment switch with
  shadows, export (zip of 6 PNGs, 2048²), multi-material OBJ import (one part with UVs, one
  without), GLB import, custom stamp import, and loading a `.hdr` environment.
- Painting 4 channels at once held **60 fps at both 2048² and 4096²** in that environment
  (frame rate is capped at 60 there; CPU cost was under 1 ms per drawn frame).
- Screenshots and the exported base color and normal maps were reviewed by eye.

Not verified: FBX, STL and PLY import; EXR environments; pen pressure with a real tablet;
browsers other than Chrome; GPUs other than Apple M1.

### Bugs found and fixed during the session

- Dev server reloaded the page when the UV worker first loaded (see decision 8).
- Sphere primitive triggered a false "UVs outside 0–1" warning; the range check now has a 1% tolerance.
- Tile culling was looser than necessary for triangles ending exactly on a tile border (found by a unit test).

### Known limitations

See "Known limitations of the current build" in [docs/ROADMAP.md](docs/ROADMAP.md). The most
important one: **projects cannot be saved yet.**

### Next

1. Project save/load and autosave (Phase 4).
2. Import a model's existing textures as a base layer.
3. 2D/UV painting view and depth-tested projection (Phase 5).
4. Test the remaining loaders with real assets.
