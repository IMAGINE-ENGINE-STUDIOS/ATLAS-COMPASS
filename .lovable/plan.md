## Plan

1. **Fix the Pacific/dateline wrapping bug**
   - Stop using tiled EPSG:4326 WMS for NASA GIBS overlays where Cesium is clearly creating bad dateline seams.
   - Replace it with a safer `SingleTileImageryProvider.fromUrl()` path using a full-world WMS image in correct WMS 1.3.0 axis order.
   - Explicitly set the world rectangle so the image maps once across `-180..180 / -90..90` and does not repeat or shear at the Pacific.

2. **Do not hide the selected Earth mode while datasets load**
   - Keep the active mode visible during dataset provider creation and tile/image loading.
   - In Google 3D / Realistic modes, if draping onto the 3D tileset is unavailable or unstable, fall back to applying datasets on the hidden globe only when needed without destroying the active photoreal tileset.
   - Ensure map-mode visibility code does not re-destroy/re-target the active map every time a dataset toggles.

3. **Make dataset loading feel faster and safer**
   - Add per-dataset loading state in the Earth Intelligence carousel card so users see when a dataset is still preparing.
   - Keep the old active overlay visible until the new provider succeeds; on failure, show the error state and avoid leaving half-applied/broken layers.
   - Limit active raster datasets to one at a time by default to avoid multiple 4096px global overlays fighting GPU/network memory.

4. **Viewport-center-first loading where Cesium allows it**
   - For normal tiled providers (Sentinel, Terrarium, Hillshade), keep Cesium’s native center/foveated request ordering.
   - For NASA GIBS global WMS, use one full-world image so there is no tile-order ambiguity or missing quadrant seam; this prioritizes correctness and avoids the Pacific fracture.

5. **Validate**
   - Test toggling Sea Surface Temperature, Land Surface Temp, AIRS, NDVI, SMAP, Sentinel-2, Terrarium, and Hillshade across Realistic, Google 3D, OSM, and Satellite modes.
   - Check console/network for tile/provider errors and visually confirm there is no Pacific seam/wrapper break and the base Earth remains visible while overlays load.