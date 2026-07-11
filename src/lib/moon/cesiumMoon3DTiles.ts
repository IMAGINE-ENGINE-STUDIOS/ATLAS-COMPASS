/**
 * Optional overlay that swaps the moon ellipsoid globe for Cesium ion's
 * photoreal Moon 3D Tileset (asset 2684829).
 *
 * The tileset is NOT terrain (loading it via CesiumTerrainProvider 404s
 * every tile). It is a 3D Tiles primitive that replaces the visible
 * surface. We keep the ellipsoid globe around as a fallback and simply
 * hide it while the tileset is active.
 *
 * Perf guards keep this behaving well on mid-range GPUs:
 *   - maximumScreenSpaceError 24 (default 16 = ~2× more tiles)
 *   - cacheBytes capped at 512 MiB
 *   - dynamicScreenSpaceError on (LOD relaxes for distant tiles)
 *   - skipLevelOfDetail on (skip mid levels on fast pans)
 *   - preloadWhenHidden off (no work while camera is elsewhere)
 */
import { Cesium3DTileset } from "cesium";

const CESIUM_MOON_ASSET_ID = 2684829;

export interface MoonPhotorealHandle {
  tileset: Cesium3DTileset;
  destroy: () => void;
}

let inflight: Promise<MoonPhotorealHandle> | null = null;

export function loadMoonPhotoreal(viewer: any): Promise<MoonPhotorealHandle> {
  if (!viewer || viewer.isDestroyed?.()) {
    return Promise.reject(new Error("viewer destroyed"));
  }
  const existing: MoonPhotorealHandle | undefined = (viewer as any).__moonPhotoreal;
  if (existing) return Promise.resolve(existing);
  if (inflight) return inflight;

  inflight = (async () => {
    const tileset = await Cesium3DTileset.fromIonAssetId(CESIUM_MOON_ASSET_ID, {
      maximumScreenSpaceError: 24,
      cacheBytes: 512 * 1024 * 1024,
      dynamicScreenSpaceError: true,
      skipLevelOfDetail: true,
      preloadWhenHidden: false,
    });
    if (viewer.isDestroyed?.()) {
      try { tileset.destroy(); } catch {}
      throw new Error("viewer destroyed during tileset load");
    }
    viewer.scene.primitives.add(tileset);
    // Hide the ellipsoid globe surface while the photoreal tileset is
    // active so we don't pay for both.
    try { viewer.scene.globe.show = false; } catch {}
    viewer.scene.requestRender?.();

    const handle: MoonPhotorealHandle = {
      tileset,
      destroy() {
        try { viewer.scene.primitives.remove(tileset); } catch {}
        try { tileset.destroy(); } catch {}
        try { viewer.scene.globe.show = true; } catch {}
        (viewer as any).__moonPhotoreal = undefined;
        viewer.scene.requestRender?.();
      },
    };
    (viewer as any).__moonPhotoreal = handle;
    return handle;
  })().finally(() => { inflight = null; });

  return inflight;
}

export function unloadMoonPhotoreal(viewer: any) {
  const h: MoonPhotorealHandle | undefined = (viewer as any)?.__moonPhotoreal;
  if (h) h.destroy();
}