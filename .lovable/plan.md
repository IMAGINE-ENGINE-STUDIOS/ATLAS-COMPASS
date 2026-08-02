## Root cause (confirmed)

The Atlas viewer for non-Earth worlds is created with a Venus/Mercury/Mars-sized **globe** but Cesium's **scene ellipsoid is left at the default WGS84**:

- `src/pages/SpaceshipPage.tsx` (~line 2856) passes only `globe: new CesiumGlobe(nonEarthEllipsoidRef.current)` to the `Viewer`. Cesium's `Viewer`/`Scene` also takes an `ellipsoid` option, which defaults to `Ellipsoid.default` (WGS84) when omitted.
- In the Cesium 1.120 bundle, `ScreenSpaceCameraController.prototype.update` sets `this._ellipsoid = scene.ellipsoid ?? Ellipsoid.default`, and its collision code does `ellipsoid.cartesianToCartographic(camera.position)`; if that height is under `_minimumCollisionTerrainHeight` it force-sets the camera to `globeHeight + minimumZoomDistance`.

So on Venus the controller measures altitude against a 6378 km sphere while the real surface is at 6051.8 km. Below a true altitude of **6378.1 − 6051.8 = 326 km** the computed height goes negative, the collision correction fires every frame, and the camera is shoved back out to ~326 km — exactly the "bounces back under ~300 km" symptom. The same offset exists on Mercury, Mars and every other catalog body.

Secondary issue found: the same `update()` recomputes `_minimumCollisionTerrainHeight`, `_minimumPickingTerrainHeight` and `_minimumTrackBallHeight` from the public properties on every frame, so the underscore-prefixed writes in `planetCameraController.ts` and `SpaceshipPage.tsx` are overwritten each frame and do nothing.

## Fix

1. **Pass the world's ellipsoid to the viewer** — in `SpaceshipPage.tsx`, add `ellipsoid: nonEarthEllipsoidRef.current` (alongside the existing `globe:` and `baseLayer: false`) in the non-Earth branch of the `Viewer` options, so `scene.ellipsoid`, the map projection and the camera controller all agree with the rendered body. Earth keeps WGS84 untouched.
2. **Set `Ellipsoid.default` for the world before viewer creation** (and restore WGS84 on unmount) as a belt-and-braces measure, because several Cesium helpers fall back to `Ellipsoid.default` rather than `scene.ellipsoid`.
3. **Clean up the threshold writes** — in `planetCameraController.ts` and the non-Earth block of `SpaceshipPage.tsx`, write only the public `minimumCollisionTerrainHeight`, `minimumPickingTerrainHeight`, `minimumTrackBallHeight`, `minimumZoomDistance` (scaled to the body radius) and drop the `_`-prefixed assignments that Cesium recomputes.
4. **Keep the 0 m floor** already added for planet zoom, and verify the last metres of descent still work now that Cesium is no longer fighting the position writes.

## Verification

Drive the preview at `/planet/venus` and `/planet/mercury` with Playwright: wheel-zoom continuously and log `Cartographic.fromCartesian(camera.position, bodyEllipsoid).height` after each notch. Pass criteria: altitude decreases monotonically through 300 km, 50 km, 1 km and reaches near 0 m with no frame-to-frame jump back upward. Screenshot a low pass to confirm the surface imagery still resolves.

## Technical notes

- Files touched: `src/pages/SpaceshipPage.tsx`, `src/lib/planets/planetCameraController.ts`.
- Risk: setting the scene ellipsoid changes what `Cartographic.fromCartesian(pos)` returns when called without an explicit ellipsoid. The page already passes `nonEarthEllipsoidRef.current` explicitly on the non-Earth paths, so no behaviour change is expected — but the Moon and Mars routes should be spot-checked after the change, since they share this viewer setup.
- No backend, schema or dependency changes.
