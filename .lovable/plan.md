# Atlas FPS Optimization — keep every feature, make it smooth

Goal: raise sustained frame rate across the Atlas experience (Earth, Moon, planets, sky, levels) without removing a single feature. Everything stays; it just runs on a tighter frame budget.

## Step 1 — Measure first

Add a dev-only performance HUD (FPS, frame time, Cesium draw calls, tiles loading, React re-render count) toggled from the Atlas settings dropdown. Capture baseline numbers on three scenes: city-level realistic tiles, orbital view, sky/star gazer. Every change below is verified against those baselines with Playwright runs, so we can prove the gain instead of guessing.

## Step 2 — Stop re-rendering the whole page

`src/pages/SpaceshipPage.tsx` is a single component with ~116 state hooks. Any small change (camera altitude, hover, coordinates, panel state) re-renders the entire tree including every overlay and panel.

- Move high-frequency values (camera altitude, sky coordinates, cursor readouts, hover target) out of page state into small subscribable stores read only by the widgets that display them.
- Wrap heavy panels and overlays in `React.memo` with stable props; hoist inline object/array/callback props into `useMemo`/`useCallback`.
- Keep behaviour identical — this is purely about which components React repaints.

## Step 3 — One frame loop instead of many

Several components each attach their own `scene.postRender` listener (altitude tracker, adaptive quality governor, tag overlay, model labels, measure tool, quake tags).

- Introduce a single Atlas frame bus that subscribes once and fans out to consumers in tiers: per-frame for screen-space DOM sync, ~4 Hz for cheap numeric readouts.
- Add a camera-dirty check: when position/orientation/frustum are unchanged and no entities moved, skip all DOM sync work entirely.

## Step 4 — Idle rendering and pixel budget

- Turn on Cesium `requestRenderMode` with a `maximumRenderTimeChange` that keeps tile streaming, animations, and live feeds working, plus explicit `requestRender()` calls wherever data or overlays change. Static views then cost near-zero GPU, which is where most stutter-inducing heat comes from today.
- Clamp render resolution to a sensible ceiling on very high-DPI screens (still crisp, far fewer pixels shaded) rather than forcing full device pixel ratio.
- Route screen-space-error, tile cache, and preload budgets through the existing device profile so laptops and phones each get a coherent setting instead of hard-coded values scattered through the file.

## Step 5 — Batch the entity layers

Quake, traffic, aircraft/vessel, marketplace, business, and POI layers create many individual entities and refresh them on timers.

- Wrap all bulk updates in `entities.suspendEvents()` / `resumeEvents()`.
- Use point/billboard/label collections and Cesium clustering for large pin sets, and only update entities inside the current view frustum.
- Keep every layer, pin type, and interaction exactly as it is.

## Step 6 — Cheaper DOM overlays

- Position label/tag overlays with `transform: translate3d(...)` only, no layout-triggering reads, `will-change` on the moving nodes.
- Cull off-screen and behind-the-globe labels, cap simultaneously visible labels with distance priority, and reuse DOM nodes instead of remounting.

## Step 7 — Visibility-aware polling

About 15 independent timers poll feeds and readouts (news, quakes, cameras, ephemeris, sky coords, traffic).

- Route them through one scheduler that pauses when the tab is hidden or the owning panel is closed, and coalesces overlapping cadences.
- Live data behaviour when visible stays the same.

## Step 8 — Lazy mounting and R3F overlays

- Audit which overlays and panels mount eagerly versus on toggle, and lazy-load the heavy ones (splats, tectonic plates, level player, sky trek, world engine) so an unused feature costs nothing until opened.
- For R3F overlays, use `frameloop="demand"` where the scene is static, clamp `dpr`, and only mount the perf sampler when the HUD is open.

## Step 9 — Quality presets

Add a Performance selector (Quality / Balanced / Battery) in the Atlas settings dropdown that scales screen-space error, label caps, overlay refresh rates, and idle rendering. No preset disables a feature; they only change how hard the renderer pushes.

## Technical notes

- Main files: `src/pages/SpaceshipPage.tsx`, `src/lib/atlasWorldScheduler.ts`, `src/lib/deviceProfile.ts`, `src/lib/atlasVisuals.ts`, and the `postRender`/timer consumers in `src/components/atlas/`.
- New: an Atlas frame bus, a lightweight external store for camera readouts, a polling scheduler, and the dev perf HUD.
- No backend changes, no data-source changes, no visual redesign.
- Verification: baseline vs. after FPS numbers on the three scenes, console clean, and a click-through of the major panels to confirm nothing regressed.
