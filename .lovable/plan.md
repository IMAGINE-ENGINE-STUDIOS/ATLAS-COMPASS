
# Fix marquee selection: real hits, green preview, save-to-group confirm

## Problems observed
1. Marquee doesn't actually select — hits go into a group immediately, so the user never sees what was selected before it's committed.
2. No confirm step — there's no visible ✓ to save the pending selection into a group.
3. Marquee requires the `M` shortcut or button to arm — user wants it to initiate the moment they press-and-drag, on mouse **and** touch (phone/iPad).
4. Selected buildings never flash green — no visual feedback that they're pending.

## Fix

### 1. Two-phase selection: pending → committed
- Introduce `pendingSelection: Set<string>` state in `AtlasBuildingsOverlay`.
- Marquee release **fills `pendingSelection`** instead of writing to a group. Every pending id is painted **green (`#22c55e`)** using the existing per-feature color override, saved as `pendingColorSnapshot: Map<osmId, originalColor>` so we can restore.
- Shift-drag = add to pending, Alt-drag = subtract, plain drag = replace.
- Single Shift-click on a building toggles it in the pending set (same green flash).

### 2. Save-Group confirm bar
- When `pendingSelection.size > 0`, show a floating action bar centered above the Selection Groups panel:
  - **Count chip** — "12 buildings selected"
  - **✓ Save as new group** — creates a group, moves ids in, restores original tint then applies group color.
  - **＋ Add to active group** — appends to `groups.activeGroup` (disabled if none).
  - **✕ Clear** — restores original tints, empties pending.
- Escape also clears pending.

### 3. Press-and-drag activation (no toggle needed)
- Replace the `M` toggle-gated overlay with a **passive pointer listener** on the Cesium canvas that watches for `pointerdown` + `pointermove > 6px` **while a modifier is held or while `Marquee` tool is armed**.
  - Default globe pan still works with a plain drag.
  - Holding **Shift** (desktop) or **two-finger long-press** (touch) starts a marquee drag mid-gesture. This matches Finder-on-trackpad behavior and avoids hijacking basic pan.
  - The old `M` button/keystroke stays as an "always-on marquee" mode for users who want every drag to select.
- Rewrite `MarqueeSelectionLayer` to use **Pointer Events** (`pointerdown/move/up/cancel`) with `setPointerCapture`, so touch on iPad/phone works identically. `touch-action: none` on the capture div.

### 4. Real hit-testing works even when tiles not loaded
- Current code walks `tileset._selectedTiles` only. If the tile the building lives in is off-screen at the moment of pick, it's missed. Add a fallback: after gathering visible-tile hits, if the rectangle is large, also raycast a 12×12 sample grid via `scene.pick` and merge those osm_ids in.

## Files touched
- `src/components/atlas/MarqueeSelectionLayer.tsx` — pointer events, touch support, `touch-action:none`, remove crosshair-only mode when armed by Shift.
- `src/components/atlas/AtlasBuildingsOverlay.tsx` — `pendingSelection` state, green paint / restore, save-confirm bar, shift-drag auto-marquee, sample-grid fallback pick.
- `src/components/atlas/SelectionGroupsPanel.tsx` — footer hint text updated ("Shift-drag to select, ✓ to save").

## No new tables, no schema changes. Frontend only.

Confirm and I build it.
