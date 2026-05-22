## Goals

1. Fix the "tile brush only works once" bug.
2. Replace the current single-purpose brush with a comprehensive **Targeting Brush** that exposes three modes in one toolbar: **Reticle** (rich single-point info), **Area** (paint/scan a circular zone), **Stamp** (multi-place a chosen 3D model).

---

## Step 1 — Fix "only works once"

Root cause in `src/pages/SpaceshipPage.tsx`:

- `confirmModelPlacement` resets `modelFile` state but never clears the underlying `<input type="file">` value. When the user picks the same file a second time, the `onChange` does not fire, so no model loads. Same trap for `convertError` from a prior attempt.
- `pendingPlacement` is cleared on success but the brush indicator is left positioned at the last placement and `brushPanelOpen` stays open — the user has no clean re-arm state.

Fix:

- In `confirmModelPlacement` (and Cancel button), also call `if (fileInputRef.current) fileInputRef.current.value = ""`, reset `convertError`, `convertProgress`, and re-show the floating brush indicator at the cursor.
- After successful placement, optionally keep `modelFile` (and the chosen scale/heading) so the next click just opens the dialog with the same model pre-loaded — that's exactly what the new Stamp mode is for (see Step 2C).

## Step 2 — Comprehensive Targeting Brush

New unified panel `BrushToolbar` mounted where the current Tile Brush panel lives. Tabbed UI (Reticle | Area | Stamp). Shared state: `brushMode: 'reticle' | 'area' | 'stamp' | null`, `brushRadiusMeters`, current `targetPoint`.

### 2A — Reticle mode (single point, rich)

Crosshair entity follows the mouse on the globe. Live HUD card shows:

- Lat / lng (6 dp), ground altitude (terrain + 3D-tile sampled), slope (derived from 4 neighbor samples).
- Reverse-geocoded address via existing Nominatim path (debounced 400 ms; cached).
- Nearest POI from existing `placedModels` + `pois` arrays + last business scan (haversine).
- Distance and bearing from current camera position.

Click locks the target. Locked actions: **Place model here** (jumps to Stamp), **Save as POI**, **Navigate (route)**, **Copy coords**.

### 2B — Area mode (paint + scan)

Click-drag on the globe paints a circle (Cesium `EllipseGraphics` with translucent emerald fill + glow outline). Radius shown live; adjustable afterward via slider (10 m – 5 km).

Inside the circle:

- Area (m²/km²), perimeter, center coords, min/max elevation (sampled grid).
- "Scan" button runs the existing Overpass query bounded to the circle and lists POIs with the standard `POICard`.
- "Stamp here" hands the circle to Stamp mode as a placement region.
- "Export GeoJSON" downloads the polygon.

### 2C — Stamp mode (multi-tile place)

Pick a 3D model once (reuses the existing upload + glTF conversion pipeline). Then every click on the globe stamps an instance — no dialog after the first.

Controls in the panel:

- Spacing (m) — clicks closer than spacing are ignored.
- Random rotation jitter (0–360°) and scale jitter (±%).
- Snap to tile altitude toggle (default on, uses existing `sampleHeight` / `getHeight` flow).
- Eraser toggle — click a placed model to delete it.
- "Fill area" — if an Area-mode circle exists, auto-stamp N copies using Poisson disk sampling at the chosen spacing.

Each stamp pushes a new `PlacedModel` into `placedModels` (reusing existing `placeModelOnGlobe`, `saveAtlasModelBlob`, blob-URL map, persistence). This is also what makes the "only works once" bug structurally impossible — the file is held in a ref, not consumed.

## Technical details

Files touched:

- `src/pages/SpaceshipPage.tsx`
  - Fix file-input reset in `confirmModelPlacement` + Cancel handler.
  - Replace `brushMode: boolean` with `brushMode: 'reticle' | 'area' | 'stamp' | null`. Migrate the existing single-mode usages.
  - Add new state: `brushRadiusMeters`, `targetPoint`, `areaCircle`, `stampModelRef` (ref to `{ blobUrl, fileName, baseScale, baseHeading }`), `stampSpacing`, `stampJitter`, `eraserOn`.
  - Extend the existing `cesium-dblclick` / mousemove flow to also emit single-click coordinates (already partially there) and a drag-rectangle for Area mode.
  - Add helpers: `sampleSlopeAt(lat, lng)`, `nearestPOI(point)`, `bearing(from, to)`, `poissonDiskInCircle(center, radius, spacing)`.

- New file: `src/components/atlas/BrushToolbar.tsx`
  - Self-contained tabbed glass panel; all data flows via props/callbacks so `SpaceshipPage` keeps owning Cesium state.

- Reuse `POICard` and `GlassPanel` — no new design tokens.

No new dependencies, no DB changes, no edge functions.

## Out of scope

- Saving brushes/areas to the cloud (kept in localStorage for now, alongside `placedModels`).
- Multi-user collaborative brushing.
- Heightmap-based volumetric brush (only flat circle for now).