
# Moon world — NASA imagery, LOLA terrain, missions catalog

Goal: make `/moon` look like a real photographic Moon, driven entirely by public NASA data, with the same Atlas tools plus a Moon‑only layers/missions panel. No Cesium ion terrain, no simulated data.

## 1. Real photo base imagery (NASA Trek WMTS)

Add a `moonImagery` module that registers a set of NASA Trek WMTS providers as Cesium `WebMapTileServiceImageryProvider` layers. Trek serves free, keyless global lunar tiles.

Default visible base:
- **LRO WAC Global Mosaic 303 ppd** — the photorealistic monochrome mosaic used by LROC. Endpoint: `https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm/{z}/{y}/{x}.jpg`.

Additional NASA base/overlay options exposed as toggleable layers:
- LRO WAC Color Shaded Relief
- LOLA Color Hillshade (elevation‑colored)
- LOLA Global Hillshade (grey relief)
- Clementine UVVIS Warped Color
- Kaguya TC Ortho Mosaic
- LROC NAC ROI mosaics for Apollo 11/12/14/15/16/17 landing sites (ultra‑high‑res tiles that stream in when the camera is near each site)
- Diviner Rock Abundance
- LOLA Slope
- Mineral / FeO / TiO2 (Clementine derived)
- Permanently Shadowed Regions polygons
- Water‑ice indicator overlay (M3‑derived)

Each layer is defined once (id, title, url, layer, tileMatrixSetID, credit, min/max level, category), consumed by both the viewer init and the new Moon Layers panel.

## 2. LOLA terrain (no Cesium ion)

Implement a `LolaTerrainProvider` that satisfies Cesium's `TerrainProvider` interface and reads elevation from NASA's public LOLA global DEM served as PNG/BIL tiles via Trek:

- Fetch `SLDEM2015` / `LOLA_LDEM_global_128ppd` PNG16 tiles at request time.
- Convert 16‑bit pixel values to meters using the documented scale/offset.
- Build a Cesium `HeightmapTerrainData` per tile with `Ellipsoid.MOON`.
- Include a small in‑memory LRU cache and graceful failure to smooth ellipsoid tiles.
- Register credit lines: "NASA LOLA / SLDEM2015 — Lunar Reconnaissance Orbiter".

Viewer init in moon mode uses this provider directly; no ion calls, no 2684829.

## 3. Moon HUD: Layers + Missions panels

Add two Moon‑only pills to the existing HUD (visible only when `moonMode` is true, reusing existing pill styling):

- **Moon Layers pill** — opens a glass panel listing every provider from step 1 with a toggle each, grouped by category (Basemap, Elevation, Composition, Landing‑site High‑Res, Special Regions). Multi‑select allowed; opacity slider per layer.
- **Missions pill** — opens a panel listing the mission catalog (step 4) with filter chips: Past crewed, Past robotic, Active orbiters, Planned (Artemis/CLPS), Sample return. Selecting a mission flies the camera to it and opens its POI card.

Both panels reuse the existing glassmorphic panel component pattern.

## 4. NASA mission & probe catalog

New static data file `src/data/moon/missions.ts` containing the full historical + planned catalog with real coordinates, dates, agency, status, description, and NASA image URLs. Sources: NSSDCA, LROC landing‑site coordinates, NASA Artemis program pages.

Covers at minimum:
- Apollo 11, 12, 14, 15, 16, 17 (with LM, ALSEP, rover traverse where known)
- Luna 2, 9, 13, 16, 17 (Lunokhod 1), 20, 21 (Lunokhod 2), 24
- Surveyor 1, 3, 5, 6, 7
- Chang'e 3 (Yutu), Chang'e 4 (Yutu‑2, far side), Chang'e 5, Chang'e 6
- Chandrayaan‑1 impact site, Chandrayaan‑3 (Vikram/Pragyan)
- SLIM (JAXA), Hakuto‑R, IM‑1 Odysseus, Blue Ghost
- Active orbiters plotted at nominal sub‑spacecraft point of prime‑meridian epoch: LRO, Chandrayaan‑2, KPLO/Danuri, Queqiao‑2
- Planned Artemis III candidate sites (13 South‑Pole regions), CLPS upcoming landers

Each entry is rendered as a Cesium `Entity` (billboard + label) plus a `POICard` (reusing the standardized card widget) with mission photo, dates, and a NASA reference link.

## 5. Camera + framing

Keep the existing `flyToBoundingSphere` initial framing. Add:
- Ellipsoid‑correct altitude readout: swap the WGS84 calculation for `Ellipsoid.MOON.cartesianToCartographic` when `moonMode` is true.
- "Selenographic" lat/lon label instead of "Lat/Lon" in the readout.
- Selecting a mission or landing‑site NAC overlay flies to its coordinates at an appropriate altitude for the feature size.

## 6. Data isolation (already partially done)

Confirmed already blocked in moon mode: Google Photoreal, OSM buildings, Earth Ion overlays, saved Earth POIs, placed models, Overpass/Nominatim/OSRM. This plan keeps that guard and adds a symmetric guard so Moon POIs and Moon‑saved content persist under a `__atlas_moon_*` localStorage namespace, never touching Earth keys.

## 7. Tools parity

All existing Atlas tools (tile brush, level placement, splat landmarks, rig saves, camera saves, drawing, measurement, screenshots, share) work unchanged on the moon; they just operate in the selenographic frame. New content the user creates on the moon is stored under Moon‑scoped tables/keys and never appears on Earth.

---

## Technical notes

- **New files**
  - `src/lib/moon/trekProviders.ts` — Trek WMTS provider factory + registry.
  - `src/lib/moon/LolaTerrainProvider.ts` — custom `TerrainProvider` reading LOLA PNG16 tiles.
  - `src/data/moon/missions.ts` — catalog.
  - `src/components/atlas/moon/MoonLayersPill.tsx`
  - `src/components/atlas/moon/MoonLayersPanel.tsx`
  - `src/components/atlas/moon/MoonMissionsPill.tsx`
  - `src/components/atlas/moon/MoonMissionsPanel.tsx`
  - `src/components/atlas/moon/MoonMissionEntities.tsx` — renders catalog as Cesium entities.
- **Edited**
  - `src/pages/SpaceshipPage.tsx` — in `moonMode`, replace ellipsoid‑only terrain with `LolaTerrainProvider`, add default LRO WAC WMTS layer, mount Moon HUD pills, swap altitude/coord readout to `Ellipsoid.MOON`, namespace persistence to `__atlas_moon_*`.
- **Endpoints (all keyless, public)**
  - Imagery: `https://trek.nasa.gov/tiles/Moon/EQ/{layerId}/1.0.0/default/default028mm/{z}/{y}/{x}.{ext}`
  - LOLA DEM: `https://trek.nasa.gov/tiles/Moon/EQ/LRO_LOLA_ClrShade_Global_128ppd_v04/...` for hillshade; raw elevation from `Moon_LRO_LOLA_ClrRoughness_Global_128ppd` and SLDEM2015 PNG16 endpoints.
- **Credits** — Attribution strings for LRO/LROC, LOLA, Clementine, Kaguya, and Diviner added to the Cesium credit display in moon mode.
- **No Cesium ion calls** in the moon path, including no `Ion.defaultAccessToken` reads and no `fromIonAssetId` invocations.
- **No mock data**, no simulated positions; orbiter pins are catalog entries with documented reference epochs.

## Out of scope (per your answers)
- Cesium ion Moon Terrain (2684829) — not used.
- Live real‑time orbiter tracking via SPICE/Horizons — not this pass.
