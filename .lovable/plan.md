# Solar System Simulator — Cesium Moon Fix + Multi-Phase Build

## Part A — Fix Cesium Moon (immediate, ships first)

Asset `2684829` (**Cesium Moon**) is a **3D Tileset**, not quantized-mesh terrain. Loading it via `CesiumTerrainProvider.fromIonAssetId` returns 404s for every terrain tile and blanks the globe. Real fix:

- Keep the LOLA-hillshade `CustomHeightmapTerrainProvider` as the ellipsoid tessellator (already restored).
- Add asset `2684829` as an optional **Cesium3DTileset** overlay:
  - Load with `Cesium3DTileset.fromIonAssetId(2684829)`, add to `viewer.scene.primitives`.
  - When active, set `viewer.scene.globe.show = false` (photorealistic tiles replace the globe surface — matches Google Moon fidelity).
  - Layer toggle in `PlanetLayerPanel` → "Photoreal 3D (Cesium Moon)".
- Perf guards: `maximumScreenSpaceError = 24` at start, `cacheBytes = 512 MiB`, `preloadWhenHidden = false`, `skipLevelOfDetail = true`, `dynamicScreenSpaceError = true`. Dispose (`.destroy()`) on layer toggle off / world switch.

Same pattern applies to any planet Cesium ion later ships a 3D tileset for (Mars ion asset when available).

## Part B — Multi-Phase Solar System Build

Goal: a solar-system-scale astronomical tool + GIS + simulation platform. Every planet behaves like Atlas Earth: real ephemeris positions, real rotation, real orbits, tileable surface imagery/terrain, POIs, model placement.

### Phase 1 — Ephemeris & scene graph (foundation)
- Extend `supabase/functions/solar-ephemeris` to return positions **and** rotation state (pole RA/Dec + prime meridian W) per body, from JPL Horizons at "now" (cached 60s server side, refreshed client side every 30s).
- New `src/lib/solar/ephemerisStore.ts`: single source of truth, tick loop, subscribers.
- Uses IAU 2015 rotational elements for per-body body-fixed frames.
- Moons of each planet included (Phobos, Deimos, Io, Europa, Ganymede, Callisto, Titan, Enceladus, etc.).

### Phase 2 — Multi-scale renderer
Three synchronised camera scales, only one active at a time (zero overlap = no perf hit):
1. **System view** — R3F scene at 1 unit = 1 Gm. Renders Sun + planets + moons as instanced spheres with real distances (log-scaled toggle), true orbital paths sampled from ephemeris, and real axial tilts. Reuses existing landing/space background pattern, no Cesium.
2. **Planet approach** — same R3F scene but scaled around the focused body, camera dolly transitions.
3. **Surface (Atlas)** — existing Cesium viewer, spawned only when altitude < ~10× radius. Hard unmount when leaving.

Perf: system view is a single `<Canvas>` with ~200 objects; Atlas is unmounted whenever not on surface. No two heavy renderers alive at once.

### Phase 3 — Per-planet tile stacks
Uniform provider interface `PlanetSurfaceProviders` returning `{ terrain, imageryLayers[] }`:
- **Earth**: existing Google 3D Tiles / Cesium World Terrain (unchanged).
- **Moon**: LOLA hillshade terrain + LRO WAC / Kaguya imagery + optional Cesium Moon 3D Tiles overlay (Part A).
- **Mars**: MOLA color-hillshade imagery (already), + CTX Mosaic (Murray Lab WMTS), + HiRISE ROI overlays for landing sites; ellipsoid smooth (custom MOLA terrain deferred until quantized-mesh source exists).
- **Mercury**: MESSENGER MDIS WMTS (already in trekCatalogs).
- **Venus**: Magellan C3-MDIR mosaic (USGS Astropedia WMTS).
- **Jupiter / Saturn / Uranus / Neptune**: reference sphere with NASA cloud-top mosaic + storm-band UV overlay; explicitly labelled "no surface GIS".
- **Sun**: SDO composite (existing sphere viewer, kept separate).
- Major moons (Io/Europa/Ganymede/Callisto/Titan/Enceladus/Triton): USGS Astrogeology WMTS where published; ellipsoid + albedo texture otherwise.

Perf: providers created lazily on world switch, `viewer.imageryLayers.removeAll(true)` before add, `maximumLevel` clamped by device pixel ratio, browser-cached via `public/tiles-sw.js`.

### Phase 4 — Rotation, orbits, lighting
- Apply body-fixed frame rotation per tick (Cesium: `viewer.clock` locked to real time; scene lit from Sun's true direction via `Sun` primitive or `DirectionalLight`).
- System view: instanced ring geometry for orbits, per-body sphere with real axial tilt + rotation.
- Real "today" positions: verify with an on-screen readout ("Mars 07/12/2026 → RA/Dec …").

### Phase 5 — Per-planet POIs, datasets, model placement
- Reuse existing POI schema; add `world_id` column (nullable defaults to `earth`).
  ```sql
  ALTER TABLE public.atlas_pois ADD COLUMN IF NOT EXISTS world_id text NOT NULL DEFAULT 'earth';
  CREATE INDEX IF NOT EXISTS atlas_pois_world_idx ON public.atlas_pois(world_id);
  ```
- Same for model placements and selection groups. RLS unchanged, still keyed by owner.
- Per-world dataset registry (mission catalogs, geology units, gravity, magnetic anomaly, etc.) in `src/data/worlds/<id>/`.
- Unified search bar scoped to active world.

### Phase 6 — Simulation layer
- Orbital propagation for user-placed satellites (SGP4 for Earth, two-body for other worlds).
- Ground tracks + coverage cones drawn as Cesium entities.
- Time controller (already have `viewer.clock`): scrub past/future, planets/moons follow.

### Phase 7 — Polish
- Distance HUD ("Mars ↔ Earth: 341.2 Gm, light-time 18m 57s").
- Screenshot menu extended to system view.
- Landing page teaser: "Explore the Solar System, exactly as it is right now."

## Perf budget (non-negotiable)
- Only one heavy renderer mounted at a time (R3F system OR Cesium surface).
- Ephemeris polling ≤ 1 request / 30s, cached server-side.
- Cesium 3D Tiles: `cacheBytes` capped, `dynamicScreenSpaceError` on, disposed on unmount.
- Tile requests routed through existing service worker (`public/tiles-sw.js`) for cross-session caching.
- No new global effects; every subscriber pattern uses a single store tick to avoid re-render storms.

## Technical notes
- Files touched in Part A: `src/pages/SpaceshipPage.tsx`, `src/components/atlas/PlanetLayerPanel.tsx`, new `src/lib/moon/cesiumMoon3DTiles.ts`.
- New in Phase 1: `supabase/functions/solar-ephemeris/index.ts` (extend), `src/lib/solar/ephemerisStore.ts`, `src/lib/solar/iauRotation.ts`.
- New in Phase 2: `src/pages/SolarSystemPage.tsx`, `src/components/solar/SystemScene.tsx`.
- Phase 3: `src/lib/planets/providers/*.ts` (one file per world).
- Phase 5 migration adds `world_id` columns; RLS + GRANTs re-verified.

## Suggested delivery order
1. Part A (Moon 3D Tiles fix, ships alongside plan approval).
2. Phase 1 + 2 (system view + real orbits) — biggest visible payoff.
3. Phase 3 (per-planet tile stacks).
4. Phase 5 (POIs/models per world).
5. Phase 4/6/7 (rotation refinement, sim, polish).

## Delivered this pass
- Mobile play-mode camera control: on-screen look pad (right 45% of the
  viewport) drains into `mobileLook` deltas that `PlayableCharacter`
  consumes the same way as desktop pointer-lock mouse move → identical
  yaw/pitch behavior between mouse and touch.
- Phase 3 tile stacks extended: added real NASA Trek WMTS catalogs for
  Venus (Magellan C3-MDIR), Vesta (Dawn HAMO), the four Galilean moons
  (Io, Europa, Ganymede, Callisto), Titan (Cassini ISS), Enceladus
  (Cassini ISS 100 m), and Phobos (Viking 40 m). Registered in
  `trekCatalogs.CATALOGS`, so `SpaceshipPage`'s generic-planet branch
  auto-mounts them with the existing `ImageryLayer` + tuning pipeline;
  each body now tile-zooms into real surface imagery instead of the
  single-tile albedo skin.
