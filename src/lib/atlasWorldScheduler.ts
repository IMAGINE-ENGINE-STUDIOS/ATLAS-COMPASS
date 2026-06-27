/**
 * AtlasWorldScheduler
 * -------------------
 * Shared, round-robin scheduler for the per-MAP work that used to run
 * inside every PlacedLevel/FreePlay overlay independently:
 *
 *   - Cesium `viewer.scene.sampleHeight` ground-clamp probes
 *
 * Why: each `sampleHeight` call walks Cesium's 3D-Tiles + terrain. Doing
 * it for every placement every 250ms (the old per-placement cadence) means
 * N MAPs ≈ N× the Cesium-side cost per second, and that's the dominant
 * source of lag once a few MAPs are loaded. With this scheduler we cap the
 * total to a constant rate (one sample per tick, ~12Hz) regardless of how
 * many MAPs are mounted — each MAP just gets its turn in round-robin.
 *
 * Singleton so PlacedLevel, AtlasFreePlayOverlay and any future MAP
 * runtime all share the same budget.
 */

import { Cartographic, type Viewer } from "cesium";

type Probe = {
  id: string;
  getLngLat: () => { lng: number; lat: number } | null;
  onHeight: (h: number) => void;
};

const probes = new Map<string, Probe>();
let order: string[] = [];
let cursor = 0;
let raf = 0;
let lastTick = 0;
let viewerRef: Viewer | null = null;

// One probe every ~80ms → ~12 samples/sec total, evenly distributed
// across however many MAPs are currently registered.
const TICK_MS = 80;

function loop(t: number) {
  raf = requestAnimationFrame(loop);
  if (t - lastTick < TICK_MS) return;
  lastTick = t;
  const viewer = viewerRef;
  if (!viewer || viewer.isDestroyed?.()) return;
  if (order.length === 0) return;
  const id = order[cursor % order.length];
  cursor = (cursor + 1) % Math.max(1, order.length);
  const probe = probes.get(id);
  if (!probe) return;
  const ll = probe.getLngLat();
  if (!ll) return;
  try {
    const carto = Cartographic.fromDegrees(ll.lng, ll.lat);
    let h: number | undefined = (viewer.scene as any).sampleHeight?.(carto);
    if (h == null || Number.isNaN(h)) {
      h = viewer.scene.globe.getHeight(carto) ?? undefined;
    }
    if (h != null && !Number.isNaN(h)) probe.onHeight(h);
  } catch {
    /* Cesium sampleHeight can throw mid-tile-stream */
  }
}

function ensureRunning(viewer: Viewer | null) {
  viewerRef = viewer;
  if (raf) return;
  raf = requestAnimationFrame(loop);
}

export const atlasWorldScheduler = {
  /** Register a ground-clamp probe. Returns an unregister function. */
  registerGroundProbe(viewer: Viewer | null, probe: Probe): () => void {
    probes.set(probe.id, probe);
    if (!order.includes(probe.id)) order.push(probe.id);
    ensureRunning(viewer);
    return () => {
      probes.delete(probe.id);
      order = order.filter((x) => x !== probe.id);
      if (probes.size === 0 && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };
  },
  /**
   * Release the held Viewer reference. Call this from SpaceshipPage's
   * unmount cleanup so the WebGL resources (~hundreds of MB) can be GC'd
   * after navigation / HMR — otherwise this module-level ref pins them.
   */
  releaseViewer(v?: Viewer | null) {
    if (v && v !== viewerRef) return; // only release the one we hold
    viewerRef = null;
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  },
};
