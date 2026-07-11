## Plan

1. **Make every Atlas world use its own placement namespace**
   - Add a single `activeWorldId` derived from the selected body (`earth`, `moon`, `mars`, etc.).
   - Use it everywhere instead of `moonMode ? "moon" : "earth"` so models, levels, POIs, brush tiles, and labels never leak between worlds.

2. **Fix local 3D model and POI persistence**
   - Change saved 3D model keys/data so Moon, Mars, and every planet load only their own placed models.
   - Change POI save/load to be world-scoped so Earth POIs do not appear on the Moon.
   - Preserve existing Earth and Moon data by migrating/falling back from the old keys when needed.

3. **Fix level placement persistence for all planets**
   - Update the level layer call to pass the real world id, not only `earth` or `moon`.
   - Add a database migration to allow `atlas_level_placements.world` values beyond just `earth`/`moon`, with an index for world-scoped loading.
   - Keep existing row security and grants intact.

4. **Unify tile and coordinate behavior**
   - Replace Earth-vs-Moon branching with a body-aware tile profile.
   - Earth keeps Web Mercator behavior.
   - Moon, Mars, and other bodies use the same non-Earth geographic tile math and each body’s ellipsoid/radius.
   - Ensure brush placement, model placement, level placement, POI placement, and overlays all use the active body ellipsoid.

5. **Remove Earth assets from non-Earth worlds**
   - Audit Atlas overlays/data layers that are Earth-only, including OSM buildings, live traffic, delivery, marketplace, LPR, Earth POIs, and search sources.
   - Hide or disable Earth-only layers outside Earth unless they have a planet-specific provider.
   - Keep the shared Atlas tools visible when they can work on any world.

6. **Fix Moon camera controls**
   - Remove the rigid Moon camera guard that forces the camera to look at the Moon center every frame.
   - Restore normal Cesium camera controls for Moon and non-Earth bodies.
   - Increase safe altitude limits and avoid snapping/canceling user movement.
   - Re-enable native collision/terrain avoidance where appropriate.

7. **Verify the result**
   - Check `/earth`, `/moon`, and `/planet/mars` behavior in the preview.
   - Confirm models, POIs, and levels save/load on the selected world only.
   - Confirm the Moon camera pans/tilts/zooms fluidly and no Earth assets appear on Moon/Mars.