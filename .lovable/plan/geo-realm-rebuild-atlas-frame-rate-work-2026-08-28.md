# Geo Realm rebuild + Atlas frame-rate work

Two tracks: rebuild Geo Realm's globe and interface from the defects found in a code review and a live capture, and continue the Atlas performance work already underway.

## What the review and screenshot actually show

Captured `/geo-realm` live at 1280x1800 and read the scene code.

Observed in the capture:
- The globe is almost black — surface detail is barely readable and the imagery has no contrast against the near-black background.
- The opening framing is a cropped globe, not a whole-Earth view.
- The left control column and the right compiler column together cover most of the viewport; the compiler column is mostly empty space.
- Plate outlines and coastlines do not line up.
- Console is full of React `Function components cannot be given refs` warnings originating in `GeoRealmScene` children.

Confirmed in code (`src/components/geo-realm/GeoRealmScene.tsx`, `src/lib/geoRealm/dataSources.ts`):
- `lonLatToUnit` maps longitude as `x = cos λ, z = sin λ`. That is the mirror of the convention Three.js sphere UVs use, so all geo layers are built east/west reversed.
- Instead of fixing the projection, `RealisticEarth` mirrors the texture (`repeat.x = -1`, `offset.x = 1`) to match. A mirrored texture renders the continents as a mirror image — this is the "Earth is flipped backwards" symptom, and it is the root cause.
- The surface map is `threejs.org/examples/textures/planets/earth_atmos_2048.jpg` — a 2048px sample texture from a third-party CDN, not NASA Blue Marble as the UI label claims.
- The texture never sets `colorSpace = SRGBColorSpace`, and it is lit through `meshStandardMaterial` with `ambientLight 0.35`. Both push the render dark, which matches what the capture shows.
- No loading or error state around the texture fetch; a CDN failure leaves a bare shell with no message.

## Track 1 — Geo Realm rebuild

**Correct the geometry.** Fix `lonLatToUnit` to the standard geographic convention so longitude runs the right way, then remove the texture mirror. Verify against landmarks in both directions: Himalayas against the Indian plate boundary, Andes against the Nazca/South America boundary, Japan trench, and the Mid-Atlantic Ridge. Every layer (boundaries, orogens, hypocenters, volumetric plates, motion arrows) is driven by this one helper, so they all correct together.

**Fix the lighting and imagery.** Swap in a real high-resolution Blue Marble map served through the existing imagery proxy rather than a third-party CDN, set sRGB colour space, and light the surface so it reads clearly at every zoom without blowing out. Add loading and failure states.

**New UI/UX.** Replace the two fixed columns with a layout built around the globe:
- Globe first: full-bleed canvas, whole-Earth framing on open, smooth zoom from orbit down to regional scale.
- One collapsible left rail organised as Layers / Structure / Plates / Seismicity, one section expanded at a time, with clear labels instead of dense caption blocks.
- The compiler becomes an on-demand panel opened from the rail, plus drag-and-drop anywhere on the globe.
- A compact bottom readout bar: coordinates, altitude, active layers, feed status.
- Selected-plate and legend content move into a right-side inspector that only appears when something is selected.
- Mobile: rail becomes a bottom sheet, inspector a second sheet, readout collapses to one line.
- Styling uses the project's semantic tokens and CSS-only animation, consistent with the rest of the app.

**Fix the warnings and scene hygiene.** Resolve the ref warnings, memoize the geometry builders so they don't rebuild on unrelated re-renders, cap the star field, and only mount the layers that are toggled on.

## Track 2 — Atlas frame rate (continuing)

Already landed as groundwork:
- `src/lib/atlas/frameBus.ts` — one `postRender` subscription per viewer, fanned out in a per-frame DOM-sync tier and a 4 Hz readout tier, with a camera-dirty check that skips all work on a static view, plus FPS sampling for the HUD.
- `src/lib/atlas/pollScheduler.ts` — visibility-aware polling that pauses when the tab is hidden or the owning panel is closed.
- `src/lib/atlas/perfPrefs.ts` — Quality / Balanced / Battery presets (resolution ceiling, screen-space-error scale, label cap, idle-frame skipping). No preset removes a feature.

Remaining:
- Perf HUD component, wired into the Atlas settings dropdown, with baseline-vs-after numbers on city tiles, orbital view, and the sky view.
- Migrate the existing `postRender` consumers (altitude writer, adaptive-quality governor, tags, model labels, quake tags, measure tool) onto the frame bus.
- Migrate the ~15 feed timers onto the poll scheduler.
- Apply the resolution ceiling and preset-scaled screen-space error; route tile cache and preload budgets through the device profile.
- Batch entity-layer updates with `suspendEvents`/`resumeEvents` and clustering for large pin sets.
- Lazy-mount heavy overlays (splats, tectonic plates, level player, sky trek) so unopened features cost nothing.

## Technical notes

- Geo Realm files: `src/pages/GeoRealmPage.tsx`, `src/components/geo-realm/*`, `src/lib/geoRealm/dataSources.ts`.
- The projection fix is a one-line change with global effect; landmark verification by screenshot is the acceptance test.
- No backend or schema changes; data sources (Bird 2003, CRUST1.0, USGS, NNR-MORVEL) stay exactly as they are.
- Verification: Playwright captures of Geo Realm at orbit and regional zoom, landmark alignment checks, clean console, and Atlas FPS numbers before/after.
