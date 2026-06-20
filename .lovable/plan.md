## Atlas Levels — Placement, Inspector, Play-as-Character

### 1. Rotation gizmo on the placement preview (before confirmation)

While a level placement is pending (the green preview box already shown by `pendingLevelPlacement` in `SpaceshipPage.tsx`), add a draggable rotation handle around the box:
- A thin ring entity (Cesium ellipse on the ground) + a small handle pin.
- Mouse-drag the handle to rotate; live-updates `pendingLevelPlacement.heading`.
- The confirmation card already exists ("Confirm placement" button) — heading is saved on confirm.
- Until confirmed the box stays editable: user can re-click the globe to move it, drag the gizmo to rotate.

### 2. Re-placing confirmed (green) boxes

Each saved placement gets a small "Edit placement" action that re-enters pending mode pre-filled with that placement's data. Confirming overwrites the existing row (`atlas_level_placements.update` by id). Same rotation gizmo applies.

### 3. Clickable Level objects + Level Inspector panel

Left-click on a placed level (Cesium box / beacon / label) opens an Atlas-side **Level Inspector** sheet:
- **Info table:** name, description, lat/lng/altitude, heading, scale, level_id, last edited.
- **Control bars:** sliders for heading, scale, altitude; toggles for "Lock to tile". Saves to `atlas_level_placements`.
- **Actions:** Open editor (`/level/:id`), Re-place, Delete, ▶ Play here.
- **Main Character section** (see #5).

### 4. Camera travels and poses a playable character

When the user clicks ▶ Play (from inspector, HUD, or the existing in-world button):
- Camera flies (existing `flyToBoundingSphere`) to the placement.
- Cesium camera input is disabled (already done).
- `AtlasLevelsR3FOverlay` mounts the level scene at that placement with `playing=true`.
- Spawn the **main character** (see #5) at the level's spawn point and hand it input/locomotion via the existing `PlayableCharacter` runtime in `LevelSceneContents`.
- Esc exits play and re-enables Cesium input.

### 5. "Main Character" in Level settings

In the Level editor (`/level/:id`), add a **Main Character** section to the settings panel:
- Picker that lists characters present in the level's scene (existing `LevelCharacter`/character nodes).
- Selected character id is stored on the level (`scene.mainCharacterId`, persisted with the rest of the scene JSONB — no schema change).
- When Atlas play activates, `LevelSceneContents` reads `scene.mainCharacterId` and assigns control to it via `PlayableCharacter`. If none is set, fall back to the first character in the scene.

The same Main Character picker is mirrored (read-only selector) inside the Atlas Level Inspector so the user can switch without leaving Atlas.

### Technical notes
- No DB schema changes. `mainCharacterId` lives inside the existing `levels.scene` JSONB.
- New files:
  - `src/components/atlas/LevelPlacementGizmo.tsx` — Cesium rotation ring + handle, wired to `pendingLevelPlacement`.
  - `src/components/atlas/LevelInspectorPanel.tsx` — info table + control bars + actions, opened from Cesium pin click.
  - `src/components/level/MainCharacterPicker.tsx` — used in Level editor settings.
- Edits:
  - `useAtlasLevelLayer.ts` — left-click now opens the inspector instead of immediately requesting play; ▶ Play stays a button in the inspector + the existing proximity HUD.
  - `SpaceshipPage.tsx` — mount gizmo while pending; mount inspector when a placement is selected.
  - `AtlasLevelsR3FOverlay.tsx` — pass `scene.mainCharacterId` through to `LevelSceneContents` for the controlled character.

### Out of scope (confirm if you want these too)
- Multi-character switching mid-play.
- Driving/flying vehicles between levels.
- Persisting the player's position across level entries.
