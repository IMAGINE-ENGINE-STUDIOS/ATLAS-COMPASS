## Atlas home button → settings dropdown

In `src/pages/SpaceshipPage.tsx` around line 4522:
- Remove the duplicate "ATLAS" text (currently `ATLASATLAS`).
- Turn the `GlassPanel` into a button that toggles a popover dropdown containing three collapsible sections:
  1. **Camera Controls** — mounts the existing `CameraHistoryTimeline` panel body (scrubber, save view, bookmarks). I'll lift its internal UI into a reusable `CameraControlsPanel` so it works both as an embedded section and as the old floating HUD.
  2. **Navigation Controls** — toggles for `WASD / Arrow keys` walk-mode, mouse-look sensitivity slider, "rotate around focus point" toggle.
  3. **Settings** — HUD visibility, buildings, atmosphere (re-using existing state setters already in the page).
- Remove the standalone floating `CameraHistoryTimeline` pill from `SpaceshipPage.tsx` (it now lives in the dropdown).

## WASD + arrow keys camera navigation

New file `src/components/atlas/useAtlasKeyboardNav.ts`:
- Hook that listens to keydown/keyup on `W A S D` + `ArrowUp/Down/Left/Right` + `Q/E` (up/down).
- Each animation frame, while keys are held, translates Cesium's `viewer.camera` along its local frame using `moveForward/Backward/Left/Right/Up/Down` scaled by current camera altitude (so it feels right both near ground and in orbit).
- Skips when focus is in an input/textarea/contenteditable.
- Controlled by an `enabled` flag wired to the Navigation Controls toggle (persisted in `localStorage` `atlas.kbNav.v1`, default ON).
- Called from `SpaceshipPage.tsx` after viewer init.

## Level click UX

In `src/components/atlas/AtlasLevelsR3FOverlay.tsx` (and/or the level pin layer in `SpaceshipPage.tsx` — I'll confirm which renders pins):
- Single click → just selects the level (highlights pin, opens compact info popover, no fly-to).
- Double click → flies camera to the level placement (existing fly-to behavior).
- Currently double-click both selects and opens a menu — split those.

## Right-click = old left-double-click menu

In `SpaceshipPage.tsx` ~line 2208:
- Move the current `LEFT_DOUBLE_CLICK` handler (model edit / POI menu) to `ScreenSpaceEventType.RIGHT_CLICK`.
- Keep the model-drag and brush-paint LEFT actions untouched.

## Left double click = camera focus point (orbit-around)

Replace the LEFT_DOUBLE_CLICK action with:
- Pick world position under cursor.
- Call `viewer.camera.lookAtTransform(Transforms.eastNorthUpToFixedFrame(picked))` so subsequent mouse drag orbits around that point.
- Show a small pulsing marker entity at the focus point.
- Pressing `Esc` (or clicking the "Release focus" chip that appears) calls `lookAtTransform(Matrix4.IDENTITY)` to restore free camera.

## Technical notes

- All keyboard input is gated when brush/terrain-edit modes are active (those already capture keys).
- `CameraHistoryTimeline` becomes `CameraControlsPanel` (renamed export) with an `embedded?: boolean` prop — when embedded, it skips the fixed-position wrapper and the toggle pill.
- Persistence keys reused: `atlas.cameraBookmarks.v1`. New keys: `atlas.kbNav.v1`, `atlas.navSensitivity.v1`.

## Files touched

- `src/pages/SpaceshipPage.tsx` — dropdown, remove duplicate label, swap dblclick/right-click handlers, wire keyboard hook, focus-point marker.
- `src/components/atlas/CameraHistoryTimeline.tsx` — add `embedded` mode.
- `src/components/atlas/AtlasLevelsR3FOverlay.tsx` — single-click select vs double-click navigate.
- New: `src/components/atlas/useAtlasKeyboardNav.ts`.
- New: `src/components/atlas/AtlasSettingsDropdown.tsx` (the dropdown shell).
