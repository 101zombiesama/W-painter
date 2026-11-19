# Roadmap

Everything a browser-based PBR texture painter needs, grouped into phases. Status reflects the
code as of the last entry in [BUILD_LOG.md](../BUILD_LOG.md).

Legend: ✅ done · 🟡 partly done · ⬜ not started

## Phase 0 — Foundation ✅

| Item | Status | Notes |
| --- | --- | --- |
| Project setup: Vite, TypeScript (strict), React, Tailwind, three.js | ✅ | |
| Feature-based architecture: service container, UI registry, event bus | ✅ | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Undo/redo history with memory budget | ✅ | 512 MB / 200 steps |
| GPU pass helpers, render-target formats | ✅ | `core/gpu` |
| On-demand viewport rendering, orbit/pan/zoom, BVH picking | ✅ | |
| Unit tests and headless end-to-end smoke test | ✅ | |

## Phase 1 — Core painting ✅

| Item | Status | Notes |
| --- | --- | --- |
| Texture-space brush engine (position-map based, polygon-count independent) | ✅ | |
| Dirty-rectangle culling for paint and compositing | ✅ | Tile grid → scissor rect |
| Channels: base color, height, roughness, metallic, emissive, AO | ✅ | Registry-driven |
| Multi-channel strokes (paint several maps at once) | ✅ | |
| Height → normal map in real time | ✅ | Sobel in UV space |
| Brush: size, flow, opacity, hardness, spacing, angle | ✅ | |
| Dynamics: size/angle/flow jitter, scatter, follow stroke, pen pressure | ✅ | |
| Stroke smoothing (lazy mouse) | ✅ | |
| Alignment: surface or camera; back-face rejection | ✅ | |
| Symmetry (X/Y/Z mirror) | ✅ | Radial symmetry: Phase 3 |
| Textured tips (alphas), built-in and imported | ✅ | 12 procedural |
| Eraser | ✅ | |
| Stamp tool, built-in and imported stamps | ✅ | 14 procedural; drag-to-size: Phase 3 |
| Material picker (eyedropper) | ✅ | Color, roughness, metallic |
| Material presets and brush presets | ✅ | 22 materials, 12 brushes |
| Brush cursor on the surface | ✅ | |

## Phase 2 — Layers ✅ (basics)

| Item | Status | Notes |
| --- | --- | --- |
| Paint layers and fill layers | ✅ | |
| Per-channel blend mode and opacity | ✅ | 8 blend modes |
| Masks: add, paint, invert, disable, remove | ✅ | |
| Reorder, duplicate, rename, hide, delete | ✅ | Drag-to-reorder: Phase 6 |
| Lazy per-channel layer storage | ✅ | |
| Undo for strokes and layer edits | ✅ | |
| Layer groups / folders | ⬜ | Phase 4 |
| Merge down, flatten, clear | ⬜ | Phase 4 |

## Phase 3 — Model, UVs, lighting, export ✅ (basics)

| Item | Status | Notes |
| --- | --- | --- |
| Import GLB/glTF (Draco, Meshopt), OBJ, FBX, STL, PLY; drag and drop | 🟡 | GLB and OBJ verified end to end; FBX/STL/PLY wired but not yet tested |
| Starter primitives | ✅ | 8 shapes |
| Texture set per material, per-set resolution 512–4096 | ✅ | |
| UV analysis (missing, out of range, overlapping) | ✅ | |
| Auto-unwrap in a worker: LSCM atlas + box-projection fallback | ✅ | |
| UV layout preview | ✅ | |
| Image-based lighting: built-in environments, custom HDR/EXR | ✅ | 6 procedural |
| Key light, shadows, exposure, tone mapping | ✅ | |
| Channel view modes | ✅ | |
| Export PNG maps, packed ORM, GL/DX normals, zip | ✅ | 8-bit |

---

## Next up

### Phase 4 — Don't lose work, and deeper layers

| Item | Status | Notes |
| --- | --- | --- |
| **Project save/load** (`.wpaint`: mesh + layer stack + pixel data, zipped) | ⬜ | Highest priority. Today only an unload warning protects work. |
| Autosave to IndexedDB / OPFS, recent projects | ⬜ | |
| Import the model's existing textures as a base layer | ⬜ | Base color, normal, ORM from glTF materials |
| Base normal map channel, combined with height-derived normals | ⬜ | Needs a tangent-space blend (RNM) |
| Layer groups with pass-through blending | ⬜ | |
| Merge down, flatten visible, clear layer | ⬜ | |
| More blend modes (color dodge/burn, soft light, difference, hue/sat/color) | ⬜ | Registry is ready |
| Filter layers / effects: blur, sharpen, levels, HSL, gradient map | ⬜ | Non-destructive, per layer |
| Fill layers with tileable textures (UV and triplanar projection) | ⬜ | |
| Procedural noise fills (Perlin, Worley, grunge) | ⬜ | |

### Phase 5 — Painting depth

| Item | Status | Notes |
| --- | --- | --- |
| 2D view: paint directly on the UV layout; split 3D/2D view | ⬜ | Dab shader needs a UV-space mode |
| Depth-tested projection (true occlusion for camera-aligned brushes) | ⬜ | Render a depth map from the camera |
| Stencils / projection of an image through the camera | ⬜ | |
| Drag to size and rotate stamps before committing | ⬜ | |
| Clone, smudge and blur brushes | ⬜ | Need to read the composite under the brush |
| Polygon/UV-island/mesh-part fill tool | ⬜ | |
| Straight lines (Shift-click), curves, text tool | ⬜ | |
| Radial symmetry, symmetry plane gizmo | ⬜ | |
| Pen tilt and rotation, pressure curve editor | ⬜ | |
| Particle brushes (drips, rain) | ⬜ | Later |

### Phase 6 — Mesh maps and smart materials

| Item | Status | Notes |
| --- | --- | --- |
| Bake mesh maps: ambient occlusion, curvature, thickness, world normal, position, ID | ⬜ | GPU ray queries against the BVH (`three-mesh-bvh` has GLSL support) |
| Generators driven by mesh maps (edge wear, dirt in cavities) | ⬜ | |
| Smart masks and smart materials (layer stack presets) | ⬜ | |
| Anchor points (reference lower layers from masks) | ⬜ | |
| High-poly → low-poly normal baking | ⬜ | |

### Phase 7 — Rendering quality

| Item | Status | Notes |
| --- | --- | --- |
| More channels: opacity, clearcoat, sheen, transmission, specular | ⬜ | Channel registry + `MeshPhysicalMaterial` |
| Parallax / displacement preview from height | ⬜ | |
| Post effects: bloom for emissive, SSAO, depth of field, vignette | ⬜ | |
| Path-traced preview mode | ⬜ | e.g. `three-gpu-pathtracer` |
| Screenshot and turntable capture | ⬜ | |
| Wireframe and UV-checker overlays | ⬜ | |

### Phase 8 — Export and interchange

| Item | Status | Notes |
| --- | --- | --- |
| Export presets (Unreal, Unity HDRP/URP, glTF, custom channel packing) | ⬜ | |
| 16-bit PNG / EXR for height and normal | ⬜ | Needs float read-back + encoder |
| Export GLB with textures applied | ⬜ | `GLTFExporter` |
| Export padding options (dilation distance, background color) | ⬜ | |
| Resize on export, per-map format and bit depth | ⬜ | |
| `.gltf` with external files, multi-file import | ⬜ | |
| UDIM tiles | ⬜ | |

### Phase 9 — Performance and scale

| Item | Status | Notes |
| --- | --- | --- |
| Allocate channel outputs lazily (skip unused emissive/AO targets) | ⬜ | Saves about 100 MB per 4K texture set |
| Cache the composite below the active layer during a stroke | ⬜ | Matters with deep stacks |
| Several dirty rectangles per frame instead of one union | ⬜ | Helps strokes crossing distant UV islands |
| Sparse/tiled layer storage (allocate only painted tiles) | ⬜ | Enables 8K |
| Build the BVH and tile grid in a worker | ⬜ | Large meshes block the UI today |
| Compress undo snapshots; spill history to disk | ⬜ | |
| WebGPU backend | ⬜ | Compute-based dabs, storage textures |
| Performance HUD (GPU memory, pass timings) | ⬜ | |

### Phase 10 — Product polish

| Item | Status | Notes |
| --- | --- | --- |
| Dockable/resizable panels, saved layouts | ⬜ | |
| Drag-to-reorder layers, multi-select, context menus | ⬜ | |
| Editable shortcuts | ⬜ | Registry is ready |
| Asset library management: folders, search, favorites, persistence | ⬜ | Imported assets are session-only today |
| Onboarding tour, sample projects | ⬜ | |
| Tablet/touch: gestures, pen-first UI | ⬜ | Touch currently only orbits |
| PWA: installable, offline | ⬜ | |
| Accessibility pass (keyboard reachability of every control, contrast audit) | 🟡 | Controls are labelled and focusable; no audit yet |
| Localization | ⬜ | |

## Known limitations of the current build

- **No saving.** Reloading the page loses the session (the browser asks for confirmation first).
- **Occlusion is approximate.** Brushes reject surfaces by distance and facing, not by depth,
  so paint can reach a nearby surface hidden behind the one you clicked if it lies within the
  brush radius.
- **Normal strength depends on texel density**, because height is converted in UV space.
- **GPU memory** grows quickly at 4096²: roughly 0.7 GB for one texture set before any layer
  is painted (about 0.2 GB at 2048²), plus 32–64 MB per painted layer channel.
- **`.gltf` files with external buffers** cannot be opened through the single-file picker; use `.glb`.
- **Imported alphas, stamps and HDRIs** live only for the session.
