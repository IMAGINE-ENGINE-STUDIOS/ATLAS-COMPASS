# Mesh Controller + Imagine Engine

Three coordinated changes:
1. Extract the existing Transform Editor into a dedicated **Mesh Controller** package.
2. Add a new **Mesh Editor** feature inside it — a full 3D model editor (materials, textures, face paint, per-mesh visibility, vertex color) that runs *while the model is placed on Earth*.
3. Rebrand the Levels system to **Imagine Engine** across all user-facing surfaces; keep routes, DB tables, and storage keys stable.

---

## 1. Mesh Controller extraction

New folder `src/components/mesh-controller/`:

```text
mesh-controller/
  MeshController.tsx          ← ex-ModelTransformWidget (renamed, all existing tabs)
  MeshControllerGizmo.tsx     ← ex-ModelGizmoOverlay
  MeshEditor/                 ← NEW mesh editor (see §2)
    MeshEditorModal.tsx
    MeshEditorCanvas.tsx      ← R3F canvas
    MaterialPanel.tsx
    FacePaintPanel.tsx
    MeshTreePanel.tsx
    exportGlb.ts              ← GLTFExporter helper
  types.ts                    ← TransformData, CropBaseUI, MeshEdits
  index.ts                    ← barrel exports
```

- Header sub-label changes from "Transform Editor" to **"Mesh Controller"**.
- Adds a fourth tab **"Mesh"** next to Position / Rotation / Scale that opens the Mesh Editor.
- Backward-compat shims kept:
  - `src/components/ModelTransformWidget.tsx` → re-exports `MeshController` as `default` and re-exports `TransformData` / `CropBaseUI`.
  - `src/components/ModelGizmoOverlay.tsx` → re-exports `MeshControllerGizmo`.
- No changes to callers (`SpaceshipPage.tsx`, `AtlasBuildingsOverlay.tsx`) required for compilation.

---

## 2. In-earth Mesh Editor (new)

Opens as a full-screen, draggable modal from the new "Mesh" tab of the Mesh Controller. Loads the placed model's GLB blob and gives users the same authoring power as Imagine Engine's model editor, but scoped to the single model sitting on Earth.

Features (ported from `LevelEditorPage`):

| Tool | Source |
|---|---|
| Per-mesh visibility toggle + isolate | `useModelMeshNames` walk |
| Material overrides (color, metalness, roughness, emissive) | `ModelMaterialOverride` |
| Texture slots (baseColor, normal, roughness, emissive) | `TextureSlot` upload |
| Face painting (paint per-face vertex colors on hover) | `FacePaintPanel` + `FacePaintContext` |
| Per-face material override | `faceOverrides` |
| Undo/redo (dedicated stack for mesh edits) | Same pattern as transform |
| Live preview against a mini HDRI + turntable | Reuses `HDRIPanel` presets |

Data flow:
- Edits stored on a new `MeshEdits` object attached to the placed model.
- On **Apply**, GLTFExporter bakes the edits into a new GLB, replaces the blob at `atlas-model-storage`, and reloads the Cesium entity so the edited model appears in-earth.
- For `AtlasBuildingsOverlay` replacement models, uploads the re-baked GLB and updates `replacement_glb_url`.

---

## 3. Rebrand Levels → Imagine Engine

Rename **user-visible strings only**. Routes (`/levels`, `/level/:id`), DB tables, and storage keys stay untouched.

Renames:
- `<h1>Levels</h1>` → **"Imagine Engine"**
- Empty state "No levels yet" → "No experiences yet"
- "Create a Level to design 3D scenes…" → "Create an experience in Imagine Engine — deploy it to Atlas as a level or map."
- "New Level" → **"New Experience"**
- "Level Wizard" → **"Imagine Wizard"**
- "Untitled Level" → **"Untitled Experience"**
- Tab label "Level" (inspector) → **"Experience"**
- Dialog title "Place Level on Atlas" → **"Deploy to Atlas"**
- SpaceshipPage HUD nav "Levels" chip → **"Imagine"**
- Toasts "Level deleted", "Level not found" → "Experience deleted", "Experience not found"
- `LevelWizardModal` internal copy → swept for "Level" → "Experience" / "Imagine"
- `LevelsListPage` page title → add `document.title = "Imagine Engine"`

Kept as-is (technical identifiers):
- Route paths `/levels`, `/level/:id`
- Component / file names (`LevelsListPage`, `LevelEditorPage`, `level_snapshots`, etc.)
- Type names (`SceneLayer`, `LevelState`, …)
- Supabase table/column names

---

## Technical section

### Files created
- `src/components/mesh-controller/MeshController.tsx` — the entire existing widget body, header sub-label "Mesh Controller", extra "Mesh" tab that toggles `meshEditorOpen`.
- `src/components/mesh-controller/MeshControllerGizmo.tsx` — moved verbatim from `ModelGizmoOverlay.tsx`, `TransformData` import updated.
- `src/components/mesh-controller/types.ts` — re-exports `TransformData`, `CropBaseUI`, and defines `MeshEdits`.
- `src/components/mesh-controller/index.ts` — barrel.
- `src/components/mesh-controller/MeshEditor/MeshEditorModal.tsx` — draggable full-viewport modal, `<Suspense>` R3F canvas + right sidebar with panels.
- `src/components/mesh-controller/MeshEditor/MeshEditorCanvas.tsx` — R3F scene: `<Canvas>`, `<OrbitControls>`, `<Environment>`, `<primitive object={gltf.scene}/>`, raycast for face paint.
- `src/components/mesh-controller/MeshEditor/MaterialPanel.tsx`, `FacePaintPanel.tsx`, `MeshTreePanel.tsx` — smaller sub-panels reusing patterns from `src/components/level/*`.
- `src/components/mesh-controller/MeshEditor/exportGlb.ts` — wraps `GLTFExporter` (three/examples/jsm) into a promise returning `Blob`.

### Files edited (backward-compat shims)
- `src/components/ModelTransformWidget.tsx` — becomes 3-line re-export.
- `src/components/ModelGizmoOverlay.tsx` — becomes 3-line re-export.

### Files edited (Imagine Engine rebrand — copy only)
- `src/pages/LevelsListPage.tsx` — h1, buttons, toasts, empty state, default name, `document.title` set to "Imagine Engine".
- `src/pages/LevelEditorPage.tsx` — dialog title, inspector tab label, default state name, error toasts.
- `src/components/level/wizard/LevelWizardModal.tsx` — internal user-facing strings.
- `src/pages/SpaceshipPage.tsx` — HUD nav chip label "Levels" → "Imagine".

### Files NOT touched
- `src/App.tsx` routes.
- Any Supabase schema / migration files.
- `src/lib/atlas-model-storage.ts`, `useBuildingRecords`, or any hook filenames.
- `useAtlasLevelLayer` and other technical identifiers.

### Persistence of mesh edits
- **SpaceshipPage models**: after Apply, the new baked GLB replaces the blob stored under the same `modelId` in `atlas-model-storage`. The entity is removed and re-added so `model.uri` refreshes.
- **AtlasBuildingsOverlay replacements**: the baked GLB is uploaded (reuse the upload path used by `onUploadModel`), `replacement_glb_url` is patched, and the Cesium entity is refreshed. RLS already restricts to the row owner.

### Dependencies
- `three` is already installed (Level editor uses it). `GLTFExporter` and `GLTFLoader` come from `three/examples/jsm/`. No new packages required.
- `@react-three/fiber` and `@react-three/drei` already present.

### Undo/redo scope
The existing per-widget undo stack keeps handling transforms. The Mesh Editor gets its own independent stack so mesh edits and transform edits don't collide.
