## Goal
Two independent wins that ship together:
1. **Atlas visual polish** — make Google Photoreal tiles look noticeably better while walking, with zero backend cost.
2. **3DGS landmark overlays** — let users upload pre-trained Gaussian Splat files (`.splat` / `.ksplat` / `.ply`) and pin them to lat/lon coords, then render them on top of the tiles when the character/camera is near.

---

## Part 1 — Visual polish pass on Atlas (today)

Edit `src/pages/SpaceshipPage.tsx` viewer init:

- **HDR + tonemapping**: `viewer.scene.highDynamicRange = true`, set `scene.postProcessStages.tonemapper = Tonemapper.ACES` (ACES filmic). Removes the "washed flat" look of Google tiles.
- **FXAA back on at low cost** + add `scene.msaaSamples = 4` when device pixel ratio ≤ 1.5 (skip on Retina to save GPU).
- **Built-in SSAO**: enable `scene.postProcessStages.ambientOcclusion` with tuned `intensity`, `bias`, `lengthCap`, `stepSize`, `frustumLength` — adds contact shading between buildings and ground.
- **Sun / atmosphere**: tighten `globe.atmosphereLightIntensity`, set `scene.light` to a `DirectionalLight` aligned with sun azimuth, slight `atmosphereHueShift`/`saturationShift` tuned for daylight realism (current values are night-themed).
- **Contact shadow under character** in `PlayableCharacter.tsx`: small dark radial sprite under feet (cheap, no shadow map).
- **Sharpen pass**: tiny custom `PostProcessStage` (unsharp-mask GLSL) on top — counters the bilinear blur at `resolutionScale 0.8`.
- **Quality preset toggle** in `Google3DController.tsx`: Off / Balanced / Cinematic so users can disable on weak GPUs.

All effects gated behind a single `applyAtlasVisuals(viewer, preset)` helper so it's one call site.

---

## Part 2 — 3DGS landmark overlays

### Storage & data
- New Cloud bucket `splat-landmarks` (public read, authenticated write).
- New table `splat_landmarks`: `name`, `description`, `lon`, `lat`, `altitude`, `heading`, `pitch`, `roll`, `scale`, `file_path` (bucket path), `radius_m` (visibility radius), `owner_id`.
- RLS: anyone authenticated can read; only owner can update/delete; service_role full.

### Rendering
- Add `@mkkellogg/gaussian-splats-3d` (works directly with three.js, supports `.splat`/`.ksplat`/`.ply`, streaming load).
- New component `AtlasSplatOverlay.tsx`:
  - Subscribes to `splat_landmarks` rows.
  - Each frame computes camera→landmark distance; loads splat when within `radius_m * 1.5`, unloads when beyond `radius_m * 3` (LRU, max 3 loaded).
  - Splats render in a sibling R3F `Canvas` (same overlay pattern as `AtlasLevelsR3FOverlay`), positioned via Cesium ECEF → world matrix already used for levels.
  - Honors play-mode camera so splats render correctly whether free-flying or walking.

### Authoring UI
- New `AtlasSplatUploader.tsx` (small dialog opened from Google3D controller dropdown):
  - Drag-drop `.splat`/`.ksplat`/`.ply` → uploads to bucket, creates row at current camera lat/lon.
  - Sliders for altitude offset, heading/pitch/roll, scale, visibility radius. Live preview.
- Existing `EarthContextMenu` gets a "Pin Splat Here" entry that pre-fills the dialog with click coords.

### Performance guardrails
- Hard cap: max 3 splat models loaded at once.
- File-size warning over 80 MB.
- Splat draw uses the same `requestRenderMode` rules as the rest of the overlay.

---

## Technical details (collapse if not relevant)

- Package adds: `@mkkellogg/gaussian-splats-3d` (~MIT, three.js-only).
- Existing `tuneAtlasTileset` and `applyAtlasMapVisibility` are untouched.
- The SSAO + tonemap toggles persist in `localStorage` under `atlas.visuals.v1` so user choice survives reloads.
- Splat positioning reuses the ECEF→world conversion already used by `AtlasLevelsR3FOverlay.tsx` (no new math).
- Migration includes GRANT block for `authenticated` + `service_role`, and storage policies for the bucket.

---

## Out of scope
- Training new splats (users bring pre-trained files; tons of free tools like Polycam, Postshot, Luma export `.ply`/`.splat`).
- Per-splat lighting integration with Cesium sun (splats are baked).
- Editing splat point clouds in-app.

Approve and I'll ship Part 1 first (visible immediately), then wire Part 2 (migration → bucket → renderer → uploader).