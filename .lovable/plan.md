## Plan — Crop Tile architectural base + voxel terrain

### Data model
Extend `PlacedModel` with a `cropBase` block (persisted to localStorage):
```
cropBase?: {
  shape: "circle" | "square",        // user picks per model
  wireframe: boolean,                // grid + axis ruler toggle
  voxelMode: "click" | "brush",      // active tool when editing
  brushRadius?: number,              // m, default 4
  brushStrength?: number,            // m per drag step, default 0.5
  // 2D height field — uniform 1 m grid centered on the model, size = ceil(2 * cropRadius)
  heights?: number[],                // length = gridSize * gridSize, meters
  gridSize?: number,                 // derived from cropRadius at create time
}
```
Defaults applied the first time `cropRadius` is set: `shape: "circle"`, `wireframe: false`, `voxelMode: "click"`, `brushRadius: 4`, `brushStrength: 0.5`, heights filled with 0.

### Rendering (Cesium primitives only)
1. **Solid grey base** — for each cropped model, build a flat grey polygon/rectangle (per `shape`) clamped to ground at the model's lat/lng. Material `Color(0.55,0.55,0.58,1)`, double-sided, depth-write enabled so it occludes the clipped tile underneath.
2. **Voxel terrain mesh** — a `Cesium.Primitive` with a custom `GeometryInstance` built from the height field: for each 1 m cell, emit two triangles raised by `heights[i]`. Vertices in local east-north-up frame, transformed with `Transforms.eastNorthUpToFixedFrame(modelCenter)`. Update by rebuilding the primitive on edit (debounced 60 ms).
3. **Wireframe overlay (toggle)** — a separate `Primitive` of `GeometryInstance` lines: minor grid every 1 m (cyan rgba(120,200,255,0.35)), major every 5 m (cyan rgba(120,220,255,0.85)). Axis ruler: two perpendicular bright lines through model origin with tick labels every 5 m rendered as billboards showing the meter value.
4. All three pieces share an `entityGroupId = `cropbase-${model.id}`` so rebuild can clear in one pass.

### Interaction
- Crop Tile widget in `ModelTransformWidget` gains a sub-panel when `cropRadius > 0`:
  - Shape segmented control: Circle | Square
  - Wireframe toggle (Switch icon)
  - Voxel tool segmented control: Click | Brush
  - Brush radius slider (1–20 m), strength slider (0.1–2 m), shown only in Brush mode
  - "Reset terrain" button (heights → 0)
- Active voxel editing engages a Cesium `ScreenSpaceEventHandler` while the widget panel is open AND the user enables "Edit terrain" mode (toggle button). While active:
  - Click mode: `LEFT_CLICK` raises the picked cell by 1 m, `SHIFT + LEFT_CLICK` lowers by 1 m.
  - Brush mode: `LEFT_DOWN` + drag paints with falloff `strength * (1 − d/radius)` per frame, `SHIFT` inverts.
  - Picking is done by ray-casting the cursor onto the voxel mesh; falls back to the local ENU plane intersection if the mesh hasn't built yet.
  - While editing, camera rotation is disabled via `viewer.scene.screenSpaceCameraController.enableRotate = false`; restored on exit.

### Persistence
Persist `cropBase` (including heights array) inside `placedModels` localStorage. Heights are typed-array friendly numbers; for a 60 m crop that's 3 600 floats ≈ 30 KB — safe.

### Files touched
- `src/pages/SpaceshipPage.tsx` — extend `PlacedModel`, add `cropBaseEntitiesRef` map, `rebuildCropBaseForModel`, `applyAllCropBases`, wire to `applyAllCrops` so they refresh together; add voxel edit handler effect gated on editing model + active tool.
- `src/components/ModelTransformWidget.tsx` — new props (`cropBase`, `onCropBaseChange`, `onResetTerrain`, `terrainEditing`, `onToggleTerrainEditing`) and the sub-panel UI under the existing Crop Tile control.

### Out of scope (deliberate)
- No undo stack for voxel edits (use Reset).
- No texture painting on the base — solid grey only.
- No round/erode brush — just additive/subtractive falloff.

### Verification
After the build, drive Playwright to: place a model in Manhattan, set crop radius 30 m, switch shape to Square, toggle wireframe on, switch to Brush mode, drag-paint a mound, reload and confirm the height field persists.