# Venus surface imagery + true close-approach zoom

## What I verified first (live checks this turn)

- NASA Trek works only for **Moon, Mars, Mercury** — those tiles return 200. Every other catalog in `src/lib/planets/trekCatalogs.ts` is dead: `Venus, Vesta, Io, Europa, Ganymede, Callisto, Titan, Enceladus, Phobos` all return **404**, and `trek.nasa.gov/tiles/<Body>/EQ/1.0.0/WMTSCapabilities.xml` returns 404 for all of them (so there is no corrected layer ID to guess — NASA simply doesn't publish those pyramids).
- In the browser at `/planet/venus`: one imagery layer mounts, all its tile requests fail (404/504), so the planet renders as flat base colour.
- Zoom stall reproduced numerically: wheel-zooming 60 notches parks the camera at radius ≈ 6,375 km on a 6,051.8 km body — **~320 km altitude, and it stops moving entirely** — even though `minimumZoomDistance` is 1.5 m. So the block is Cesium's Earth-tuned zoom/picking behaviour on small ellipsoids, not the zoom clamp.
- Working replacements confirmed: USGS Venus WMS (`planetarymaps.usgs.gov` `venus_simp_cyl.map`) serves `MAGELLAN` (radar SAR), `MAGELLAN_color`, `MAGELLAN_topography` — HTTP 200, JPEG, `access-control-allow-origin: *`. A global Venus albedo JPEG on jsDelivr also returns 200 as a fallback skin.

## 1. Real Venus surface (USGS Magellan WMS)

- Add a WMS-backed layer type to the planet catalog (`kind: "wms" | "wmts" | "texture"`), with a `createPlanetImageryProvider` branch that builds Cesium `WebMapServiceImageryProvider` for WMS entries.
- Venus layers: **Magellan Left-Look SAR** (default basemap), **Magellan Colour Topography**, **Magellan Topography** — all toggleable in the existing planet layer picker with credits and descriptions.
- Mount a single-tile Venus albedo texture as the bottom layer so the disc is never blank while WMS tiles stream.

## 2. Stop shipping dead tile sources

- Replace the 9 dead Trek catalogs with the single-tile global-mosaic texture path already supported for gas giants (Voyager/Galileo/Cassini-derived global maps), so Io, Europa, Ganymede, Callisto, Titan, Enceladus, Vesta, Ceres and Phobos show a real surface instead of a coloured ball.
- Add a self-healing guard: subscribe to each imagery provider's `errorEvent`; after 3 consecutive tile failures, remove that layer and fall back to the body's texture skin, logging once. This prevents any future upstream outage from producing a blank planet.

## 3. True close approach on every non-Earth body

- Add `src/lib/planets/planetCameraController.ts`: on non-Earth worlds, disable Cesium's built-in wheel/pinch zoom and drive the camera ourselves — each notch moves a fraction of the *current altitude above the ellipsoid* (geometric zoom), so approach stays smooth from 100,000 km down to metres.
- Per-body floor: `minAltitude = max(30 m, radius × 2e-6)` — roughly 12 m on Venus, 5 m on Enceladus — and re-set Cesium's picking/collision/trackball thresholds from the body radius instead of Earth's defaults.
- Keep tilt/rotate/pan on Cesium defaults so orbiting feels identical to Earth; scale rotate/pan inertia with altitude so low passes aren't hypersensitive.
- Double-click a surface point on any body flies to ~2 km above it; scroll continues from there.
- `src/pages/PlanetPage.tsx` (the simple sphere viewer for the Sun/gas giants): `minDistance` from `radius × 1.4` → `radius × 1.02`, and stop auto-rotate once the user interacts.

## 4. Verification before I hand back

- Headless browser run per body (Venus, Mercury, Io, Titan, Enceladus): assert zero failing imagery requests and that 80 wheel notches bring camera altitude under 1 km, with screenshots of the surface at high zoom.

## Technical notes

- Files touched: `src/lib/planets/trekCatalogs.ts`, `src/lib/planets/config.ts`, new `src/lib/planets/planetCameraController.ts`, `src/pages/SpaceshipPage.tsx` (generic-planet imagery + camera wiring), `src/pages/PlanetPage.tsx`.
- No backend or schema changes; all sources are keyless, CORS-enabled, canonical NASA/USGS data (no synthetic imagery).
- WMS deep zoom on Venus is limited by the source mosaic (Magellan SAR ~75 m/px), so imagery softens below a few hundred metres — that is the real data ceiling, not a bug.
