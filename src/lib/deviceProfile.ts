/**
 * Device profile — a single, cached read of what this device can actually
 * handle. Used by the Atlas tile pipeline and R3F scenes to pick memory
 * budgets that won't OOM the tab.
 *
 * The old defaults were desktop-tuned (2 GiB tile RAM cache). On a phone
 * that instantly crashes the tab (Mobile Safari caps ~1 GB per tab, and
 * Android WebView often less). This module returns per-device budgets so
 * we get the big cache on desktops and a safe budget on phones.
 */

export type DeviceTier = "mobile-low" | "mobile" | "desktop" | "desktop-high";

export interface DeviceProfile {
  tier: DeviceTier;
  isMobile: boolean;
  deviceMemoryGB: number;      // navigator.deviceMemory, defaults conservatively
  hardwareConcurrency: number;
  /** In-RAM tile cache in MiB for photoreal 3D Tilesets. */
  tileCacheMiB: number;
  /** Slack allowed above tileCacheMiB before Cesium trims. */
  tileCacheOverflowMiB: number;
  /** Cesium globe tile cache count. */
  globeTileCache: number;
  /** Screen-space error to prefer at boot (higher = fewer tiles). */
  bootSse: number;
  /** True if we should turn off aggressive preloading. */
  conservativePreload: boolean;
}

let cached: DeviceProfile | null = null;

export function getDeviceProfile(): DeviceProfile {
  if (cached) return cached;
  const nav: any = typeof navigator !== "undefined" ? navigator : {};
  const ua = String(nav.userAgent || "");
  const uaMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(ua);
  const coarse = typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(pointer: coarse)").matches;
  const isMobile = uaMobile || coarse;
  const deviceMemoryGB: number = typeof nav.deviceMemory === "number" ? nav.deviceMemory : (isMobile ? 3 : 8);
  const hardwareConcurrency: number = typeof nav.hardwareConcurrency === "number" ? nav.hardwareConcurrency : (isMobile ? 4 : 8);

  let tier: DeviceTier;
  if (isMobile && deviceMemoryGB <= 3) tier = "mobile-low";
  else if (isMobile) tier = "mobile";
  else if (deviceMemoryGB >= 8 && hardwareConcurrency >= 8) tier = "desktop-high";
  else tier = "desktop";

  const profile: DeviceProfile = (() => {
    switch (tier) {
      case "mobile-low":
        return {
          tier, isMobile, deviceMemoryGB, hardwareConcurrency,
          tileCacheMiB: 192, tileCacheOverflowMiB: 64,
          globeTileCache: 300, bootSse: 24, conservativePreload: true,
        };
      case "mobile":
        return {
          tier, isMobile, deviceMemoryGB, hardwareConcurrency,
          tileCacheMiB: 320, tileCacheOverflowMiB: 96,
          globeTileCache: 500, bootSse: 20, conservativePreload: true,
        };
      case "desktop":
        return {
          tier, isMobile, deviceMemoryGB, hardwareConcurrency,
          tileCacheMiB: 1024, tileCacheOverflowMiB: 256,
          globeTileCache: 1200, bootSse: 12, conservativePreload: false,
        };
      case "desktop-high":
      default:
        return {
          tier: "desktop-high", isMobile, deviceMemoryGB, hardwareConcurrency,
          tileCacheMiB: 2048, tileCacheOverflowMiB: 512,
          globeTileCache: 1800, bootSse: 8, conservativePreload: false,
        };
    }
  })();

  cached = profile;
  try {
    // eslint-disable-next-line no-console
    console.info("[deviceProfile]", profile);
  } catch {}
  return profile;
}

/**
 * Live memory-pressure reading. Returns a value in [0,1] where 1 means we
 * are near the JS heap limit and callers should shed load (drop caches,
 * raise SSE, cancel background work). Returns 0 when the browser doesn't
 * expose `performance.memory` (Firefox/Safari).
 */
export function memoryPressure(): number {
  try {
    const mem = (performance as any)?.memory;
    if (!mem || !mem.jsHeapSizeLimit) return 0;
    return Math.max(0, Math.min(1, mem.usedJSHeapSize / mem.jsHeapSizeLimit));
  } catch { return 0; }
}
