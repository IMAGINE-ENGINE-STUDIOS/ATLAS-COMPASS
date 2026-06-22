## Moving Level → MAP, into the Atlas

Today: levels live as their own page (`/level/:id`) and are streamed into Atlas as proximity-loaded R3F overlays anchored to lat/lng. With more than one nearby placement the dual canvas + per-level mixers + ground sampling crush the frame rate.

Goal: a **MAP** is a single importable file group (geometry, models, characters, terrain, lights, splines, train, etc.) that, when loaded, lays its objects directly into Atlas's own R3F world — no separate overlay per placement, no streaming windows. The full Level toolset (terrain sculpt, face paint, geometry, splines, characters, behaviors, train, etc.) becomes available **inside Atlas** when "Edit MAP" is active.

```text
Before                              After
──────                              ─────
/level/:id  (editor page)           /atlas  (one editor + viewer)
  └─ scene.json                       ├─ MAP file (.map / JSON in DB)
                                      │   = same scene payload + ENU anchor
/atlas                                └─ Atlas R3F overlay owns ALL objects
  └─ N AtlasLevelsR3FOverlay              from every loaded MAP, one canvas
      └─ N PlacedLevel (one per             one mixer pool, one ground-clamp
          placement, each its own
          R3F canvas / mixer)         (Levels list page → "Maps" library:
                                       import / export / share .map files)
```

### Phase 1 — MAP file format & I/O (no UI change yet)
- Rename concept: `Level` → `Map` at the type level. Add `src/lib/mapFile.ts` with:
  - `MapFile = { version, name, anchor: {lat, lng, alt, heading}, scene: LevelScene, assets?: PackagedAssets }` — wraps the existing `LevelScene` so nothing in the runtime renderers has to change yet.
  - `exportMap(level) → Blob` (JSON, optionally zipped with bundled HDRI/glb via the existing `levelPackage.ts` pipeline).
  - `importMap(file) → MapFile` with migration of legacy `level` rows.
- DB: rename surface only. Keep `levels` + `atlas_level_placements` tables, add views/aliases `maps` / `atlas_map_placements`. No destructive migration.

### Phase 2 — Unified Atlas scene (the perf win)
Replace `AtlasLevelsR3FOverlay` (one Canvas per placement) with **one** `AtlasMapWorld`:
- A single full-viewport R3F `<Canvas>` already drawing the levels overlay.
- One ECEF camera sync, one ground-clamp loop, one animation mixer registry.
- For each loaded MAP, render its objects under a `<group>` whose matrix = ECEF(anchor) · ENU · heading. Re-uses `LevelSceneContents` per map but inside the shared canvas — no extra canvases.
- Proximity LOD becomes a per-object cull (frustum + distance) instead of per-level mount/unmount, so panning between maps is jank-free.

### Phase 3 — Level tools, in-place inside Atlas
Surface the existing tool panels (currently in `LevelEditor`) as Atlas side-panels that bind to the **active MAP**:
- Geometry / Terrain / FacePaint / Characters / Animations / Splines / Train / Lights / HDRI — all current panels move under `src/components/atlas/map-editor/` and read+write the active MAP's `scene`.
- "Edit MAP" toggle on a placed map shows handles + tool tabs. Saving writes back to the same row.
- Right-click "Play from here" (just shipped) keeps working; "Play this MAP" enters with the map's `mainCharacterId`.

### Phase 4 — Retire `/level/:id`
- Replace the Levels list page with a **Maps library** (import `.map`, export, duplicate, share, "Place on Atlas"). The old standalone editor route redirects to `/atlas?map=:id&edit=1`.
- Keep the route shim for one release so existing links resolve.

### Technical notes
- The on-disk shape is unchanged — `LevelScene` is the scene payload of a MAP. The win comes from **one canvas, many maps** instead of **one canvas per nearby map**.
- `useAtlasLevelLayer` (Cesium pin/box fallback) keeps the cheap green box for far-away maps; up close, the unified R3F renders them.
- Soldier free-play (just added) stays independent of MAPs.

### What I need from you before I cut code
1. Confirm "MAP" is the user-facing name (vs. "World" / "Scene" / "Place").
2. OK to keep DB table names internally (`levels`) with a UI-only rename? Or do you want a real rename migration?
3. Should the `/level/:id` route hard-redirect now, or stay live in parallel for one release?

I'll execute Phase 1+2 first (file format + unified canvas — the perf fix), then Phase 3 (tools in Atlas), then Phase 4 (retire the page).