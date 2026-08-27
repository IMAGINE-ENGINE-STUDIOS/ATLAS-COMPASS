/**
 * Atlas performance presets.
 *
 * Three presets that trade pixel/tile pressure for frame rate. None of them
 * disables a feature — every layer, panel, and data source stays available;
 * only how hard the renderer pushes changes.
 *
 *   quality   — full detail, full resolution (previous behaviour)
 *   balanced  — default: resolution capped near 1x CSS pixels, slightly higher
 *               screen-space error, idle frames skipped
 *   battery   — lowest pixel + tile pressure, fewest DOM labels
 */
export type AtlasPerfPreset = "quality" | "balanced" | "battery";

export interface AtlasPerfTuning {
  /** Upper bound on Cesium `resolutionScale` relative to CSS pixels. */
  maxResolutionScale: number;
  /** Multiplier applied to tileset / globe screen-space error. */
  sseScale: number;
  /** Max simultaneously visible DOM labels in overlays. */
  labelCap: number;
  /** Let Cesium skip rendering when nothing changed. */
  idleSkip: boolean;
}

const KEY = "atlas.perf.preset";

const TUNING: Record<AtlasPerfPreset, AtlasPerfTuning> = {
  quality: { maxResolutionScale: 2, sseScale: 1, labelCap: 260, idleSkip: false },
  balanced: { maxResolutionScale: 1.25, sseScale: 1.25, labelCap: 160, idleSkip: true },
  battery: { maxResolutionScale: 1, sseScale: 1.75, labelCap: 90, idleSkip: true },
};

let current: AtlasPerfPreset = (() => {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === "quality" || raw === "balanced" || raw === "battery") return raw;
  } catch {}
  return "balanced";
})();

const listeners = new Set<(p: AtlasPerfPreset) => void>();

export function getAtlasPerfPreset(): AtlasPerfPreset { return current; }
export function getAtlasPerfTuning(preset: AtlasPerfPreset = current): AtlasPerfTuning {
  return TUNING[preset];
}
export function setAtlasPerfPreset(p: AtlasPerfPreset) {
  if (p === current) return;
  current = p;
  try { localStorage.setItem(KEY, p); } catch {}
  listeners.forEach((l) => { try { l(p); } catch {} });
  try { window.dispatchEvent(new CustomEvent("atlas-perf-preset", { detail: p })); } catch {}
}
export function subscribeAtlasPerfPreset(fn: (p: AtlasPerfPreset) => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Resolution scale to hand Cesium for the active preset on this display. */
export function resolutionScaleFor(preset: AtlasPerfPreset = current): number {
  const dpr = typeof window !== "undefined" ? (window.devicePixelRatio || 1) : 1;
  const cap = TUNING[preset].maxResolutionScale;
  // Cesium's resolutionScale is relative to CSS pixels *after* it applies dpr
  // internally when useBrowserRecommendedResolution is false, so clamping to
  // cap/dpr keeps at most `cap` device pixels per CSS pixel.
  return Math.min(1, Math.max(0.66, cap / dpr));
}
