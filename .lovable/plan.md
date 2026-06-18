# Golden selected stores + unified atlas tag clustering

## Goal
1. Let the user **select** atlas store/business pins. Selected stores render in a distinct **gold** style and always sit on top of every other tag.
2. When many atlas tags (business pins, saved POIs, marketplace pins) crowd a screen area, collapse them into a **grouped pill** using the same HTML cluster system already used by `ModelLabelsOverlay` (single → coloured pill; many → category-grouped row of circular thumbnails).

## UX

- **Selecting a store**: clicking a store pin opens the existing POI/Business card. Card gains a new **"Select"** (star) toggle. Toggling marks the pin as selected.
- A small **"Selected (n)"** chip near the QuickStoreFilter shows the count and exposes a "Clear all" action.
- Selected store pins repaint with a gold pin canvas (gradient `#FFD700 → #B8860B`), thicker border, gold glow, slightly larger scale, and `eyeOffset.z = -50` so they always render in front of other billboards.
- Selection survives reloads (localStorage), keyed by entity id.

- **Unified cluster overlay**: a new `<AtlasTagsOverlay>` HTML layer (z above billboards) takes the union of:
  - business pins (current `businessEntitiesRef` data)
  - saved POIs (`pois` state)
  - marketplace product pins
  and projects them to screen space each `postRender`. Logic mirrors `ModelLabelsOverlay`:
    - Cluster recomputed on `camera.moveEnd` (stable mid-flight).
    - Pins within `clusterDistancePx` (default 64) of the same **category** merge.
    - Single member → coloured glass pill with icon + name.
    - Multiple → glass pill showing `CATEGORY · N` + up to 8 circular avatars (favicon if available, else initials) + `+N` overflow.
    - Selected (gold) members always render as their own pill on top of the cluster row, never collapsed away, and the cluster pill gets a subtle gold ring if it contains any selected member.
- When the overlay is active, the underlying Cesium billboards switch to a smaller "dot" canvas to avoid double-rendering; the HTML pill becomes the interactive surface. A toggle in the existing tag controls lets users go back to raw billboard pins.

## Technical

### New / changed files

- `src/lib/atlasSelection.ts` (new): tiny store for the selected-pin set.
  ```ts
  type Sel = { kind: "biz" | "poi" | "market"; id: string; lat: number; lng: number; name: string; category?: string };
  // get/set/toggle/clear + subscribe + localStorage persistence ("atlas_selected_tags")
  ```
- `src/pages/SpaceshipPage.tsx`:
  - Import selection store + new overlay.
  - `createPinCanvas` gains `goldenSelected?: boolean` → gold gradient + bigger ring.
  - When adding business billboards, look up `isSelected(id)`; if true, paint gold pin and set `eyeOffset = new Cartesian3(0,0,-50)`. Subscribe to selection changes to repaint affected entities (replace `billboard.image` + `eyeOffset`).
  - Existing POI / business / marketplace popups gain a **Select** star button wired to `toggleSelected(...)`.
  - Mount `<AtlasTagsOverlay viewer={viewerRef.current} businesses={...} pois={pois} marketplace={...} onOpen={...} />` next to existing overlays.
  - Show a "Selected (n) · Clear" chip near `QuickStoreFilter` when count > 0.
- `src/components/atlas/AtlasTagsOverlay.tsx` (new): close copy of `ModelLabelsOverlay`'s clustering math, generalised to take a heterogeneous `AtlasTag[]` source. Reuses `MODEL_CATEGORIES` palette where possible and maps business amenity → category id (`restaurant|cafe|shop|hotel|fuel|health|landmark|other`). Selected tags rendered with gold border + glow; cluster pills containing selected members get a 1px gold outer ring.

### Cluster algorithm (same as ModelLabelsOverlay)

```text
for each tag projected to screen:
  if not used:
    seed cluster with same category within R px
    record key = sorted member ids joined by "|"
```

Recompute only on `camera.moveEnd`; positions sync every `postRender` via direct DOM transforms (no React commits per frame).

### Persistence

- `localStorage["atlas_selected_tags"] = JSON.stringify(Sel[])`. No backend changes.

## Out of scope
- Server-side sync of selections across devices.
- Editing pin geometry from the cluster pill (kept read-only; tap a thumbnail to open existing detail card).
- Changes to the model-labels overlay itself.
