## Goal

Close the fidelity gap between Earth and the other worlds by wiring in every real, public GIS pyramid that exists, and adding paid Cesium ion terrain where NASA Trek falls short. No fake data.

## What I will build

### 1. Trek pyramids for terrestrial rocky bodies

Add a real WMTS layer catalog for every body USGS/NASA publishes a public tile pyramid for. These use the same `WebMapTileServiceImageryProvider` + `GeographicTilingScheme` pattern that already powers Moon and Mars, so behavior (pan, zoom, tile refinement) matches those worlds exactly.

- `src/lib/planets/mercuryProviders.ts` — MESSENGER MDIS basemap (166 m/px, zoom 8), MESSENGER color, MLA topography.
- `src/lib/planets/venusProviders.ts` — Magellan C3-MDIR radar mosaic (75 m/px, zoom 7), Magellan topography.
- `src/lib/planets/vestaProviders.ts` — Dawn FC HAMO clear-filter mosaic.
- `src/lib/planets/ceresProviders.ts` — Dawn FC HAMO mosaic.

`SpaceshipPage.tsx` currently drapes generic planets with a single 1K JPG via `SingleTileImageryProvider`. I will branch that block: if the planet has a trek catalog, load its default WMTS layers; otherwise (Jupiter/Saturn/Uranus/Neptune/Sun) keep the single-tile skin — those have no surface to tile.

### 2. Real Mars terrain (MOLA DEM)

Currently Mars is a flat ellipsoid under imagery — no relief. Add `src/lib/mars/MolaTerrainProvider.ts` using the same `CustomHeightmapTerrainProvider` pattern as `LolaTerrainProvider.ts`, but sourcing real MOLA elevation from the NASA Trek MOLA color-shaded hillshade at 463 m/px. Amplitude clamped so Olympus Mons and Valles Marineris show real relief without breaking wheel-zoom collision.

Wire it in `SpaceshipPage.tsx` inside the `marsModeRef.current` branch — replace the "terrain stays as the ellipsoid surface" comment with the provider assignment. Camera-clamp/keyboard-nav files already read the correct ellipsoid, so no changes there.

### 3. HiRISE landing-site ROIs on Mars

Extend the Mars layer catalog with high-zoom (level 12+) HiRISE / CTX ROI mosaics NASA publishes for the famous rover sites:
- Curiosity — Gale Crater
- Perseverance — Jezero Crater
- Opportunity — Meridiani Planum
- Viking 1 & 2, InSight

Same pattern as the existing Apollo 11/17 NAC ROIs on the Moon — bounded rectangle, loads only when the camera is inside it.

### 4. Cesium ion Moon & Mars assets

Google does not publish Moon or Mars 3D Tiles (their proprietary Google Earth Moon/Mars is a separate closed product). The closest real equivalents are on Cesium ion:

- **Cesium Moon Terrain** (asset `2684829`) — real LOLA-derived quantized-mesh DEM. Replaces the current hillshade-luminance-derived Moon terrain so lunar relief becomes scientifically accurate.
- **Any Mars 3D Tiles / terrain assets** the connected ion account grants (the token already lists assets via `/v1/assets`). If present, they load on top of MOLA base terrain, matching how `_ionDetailOverlays` already streams Ion Earth city meshes.

I will honestly label this in the UI: "Cesium ion terrain" / "NASA Trek", not "Google Moon".

### 5. Layer picker parity

The existing Moon layer picker (`MoonPanels.tsx`) already lets the user toggle Trek layers and set alpha. I will make it generic — one `PlanetLayerPanel` component driven by the active world's layer catalog — so Mercury, Venus, Vesta, Ceres, and Mars all get the same layer-toggle experience Moon has today.

### 6. UI honesty for the gas giants

Jupiter, Saturn, Uranus, Neptune, Sun stay as single-tile skins because no surface pyramid exists. I'll add a small pill on those worlds: "No surface GIS available — cloud-top reference sphere." Same treatment for the Sun.

## Technical notes

- All Trek endpoints are keyless and CORS-enabled. No secrets required.
- Cesium ion Moon Terrain (2684829) is free on the current token. Any premium Mars assets depend on the connected ion account and will silently no-op if unavailable.
- All the world-scoped data isolation from prior turns (models, POIs, levels, splats, datasets, geofences) already keys off `activeWorldId`, so the new planets automatically get isolated storage — nothing to change there.
- No database migration needed for this work.

## Files touched

- New: `src/lib/planets/mercuryProviders.ts`, `venusProviders.ts`, `vestaProviders.ts`, `ceresProviders.ts`, `src/lib/mars/MolaTerrainProvider.ts`, `src/components/atlas/PlanetLayerPanel.tsx`.
- Edited: `src/pages/SpaceshipPage.tsx` (planet branch + ion Moon terrain + MOLA wire-up), `src/lib/mars/marsProviders.ts` (HiRISE ROIs), `src/components/atlas/moon/MoonPanels.tsx` (generalized), `src/lib/planets/config.ts` (flag which planets have tile catalogs).

## Out of scope

- Google Photorealistic 3D Tiles for Moon/Mars — does not exist publicly.
- Terrain for gas giants — no surface exists.
- Custom HiRISE DEMs beyond what Trek publishes — those are per-site GeoTIFFs, not a global pyramid.
