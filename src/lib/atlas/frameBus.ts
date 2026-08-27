/**
 * Atlas frame bus — one Cesium `postRender` subscription per viewer, fanned
 * out to every consumer.
 *
 * Before this, each overlay (tags, model labels, quake tags, measure tool)
 * plus the altitude writer and the adaptive-quality governor attached its own
 * `scene.postRender` listener. Cesium then walked N listener arrays per frame
 * and every consumer re-did the same camera reads.
 *
 * The bus attaches once and offers two tiers:
 *   - `subscribeFrame`  — screen-space DOM sync. Runs only when the camera
 *                          (or the canvas size) actually changed, or when a
 *                          consumer calls `markAtlasFrameDirty()` because its
 *                          own data moved. A static view costs nothing.
 *   - `subscribeSlow`   — cheap numeric readouts, throttled to ~4 Hz.
 *
 * It also samples frame time and publishes an FPS snapshot for the perf HUD.
 */
import type { Viewer } from "cesium";

type Fn = () => void;

interface Entry {
  viewer: Viewer;
  remove: () => void;
  frame: Set<Fn>;
  slow: Set<Fn>;
  lastSlow: number;
  dirty: boolean;
  // camera-dirty snapshot
  px: number; py: number; pz: number;
  dx: number; dy: number; dz: number;
  ux: number; uy: number; uz: number;
  fov: number;
  cw: number; ch: number;
  // fps sampling
  lastT: number;
  emaMs: number;
  frames: number;
  acc: number;
  lastEmit: number;
}

const entries = new WeakMap<Viewer, Entry>();
let dirtyAll = false;

export interface AtlasFrameStats {
  fps: number;
  ms: number;
  /** DOM-sync callbacks executed in the last second. */
  syncs: number;
  tilesLoading: number;
  drawCalls: number;
}

let stats: AtlasFrameStats = { fps: 0, ms: 0, syncs: 0, tilesLoading: 0, drawCalls: 0 };
const statListeners = new Set<(s: AtlasFrameStats) => void>();

export function getAtlasFrameStats() { return stats; }
export function subscribeAtlasFrameStats(fn: (s: AtlasFrameStats) => void) {
  statListeners.add(fn);
  return () => { statListeners.delete(fn); };
}

/** Force the next frame tick to run DOM sync even if the camera is static. */
export function markAtlasFrameDirty() { dirtyAll = true; }

function cameraChanged(e: Entry): boolean {
  const v = e.viewer;
  let changed = false;
  try {
    const c = v.camera;
    const p = c.positionWC, d = c.directionWC, u = c.upWC;
    const fov = (c.frustum as any)?.fov ?? 0;
    const cw = v.canvas?.clientWidth ?? 0;
    const ch = v.canvas?.clientHeight ?? 0;
    if (
      p.x !== e.px || p.y !== e.py || p.z !== e.pz ||
      d.x !== e.dx || d.y !== e.dy || d.z !== e.dz ||
      u.x !== e.ux || u.y !== e.uy || u.z !== e.uz ||
      fov !== e.fov || cw !== e.cw || ch !== e.ch
    ) {
      changed = true;
      e.px = p.x; e.py = p.y; e.pz = p.z;
      e.dx = d.x; e.dy = d.y; e.dz = d.z;
      e.ux = u.x; e.uy = u.y; e.uz = u.z;
      e.fov = fov; e.cw = cw; e.ch = ch;
    }
  } catch { changed = true; }
  return changed;
}

function ensure(viewer: Viewer): Entry {
  const existing = entries.get(viewer);
  if (existing) return existing;

  const now = performance.now();
  const entry: Entry = {
    viewer,
    remove: () => {},
    frame: new Set(),
    slow: new Set(),
    lastSlow: 0,
    dirty: true,
    px: NaN, py: NaN, pz: NaN,
    dx: NaN, dy: NaN, dz: NaN,
    ux: NaN, uy: NaN, uz: NaN,
    fov: NaN, cw: 0, ch: 0,
    lastT: now, emaMs: 16.6, frames: 0, acc: 0, lastEmit: now,
  };

  let syncCount = 0;
  const tick = () => {
    if (viewer.isDestroyed()) { entry.remove(); entries.delete(viewer); return; }
    const t = performance.now();
    const dt = t - entry.lastT;
    entry.lastT = t;
    if (dt > 0 && dt < 1000) {
      entry.emaMs = entry.emaMs * 0.9 + dt * 0.1;
      entry.frames += 1;
      entry.acc += dt;
    }

    const moved = cameraChanged(entry);
    if (moved || dirtyAll || entry.dirty) {
      dirtyAll = false;
      entry.dirty = false;
      for (const fn of entry.frame) {
        try { fn(); syncCount += 1; } catch {}
      }
    }

    if (t - entry.lastSlow >= 250) {
      entry.lastSlow = t;
      for (const fn of entry.slow) {
        try { fn(); } catch {}
      }
    }

    if (t - entry.lastEmit >= 500) {
      const fps = entry.acc > 0 ? Math.round((entry.frames * 1000) / entry.acc) : 0;
      let tilesLoading = 0;
      let drawCalls = 0;
      try { tilesLoading = (viewer.scene.globe as any)?._surface?._tileLoadQueueHigh?.length ?? 0; } catch {}
      try { drawCalls = (viewer.scene as any)?.frameState?.commandList?.length ?? 0; } catch {}
      stats = {
        fps,
        ms: +entry.emaMs.toFixed(2),
        syncs: Math.round((syncCount * 1000) / Math.max(1, t - entry.lastEmit)),
        tilesLoading,
        drawCalls,
      };
      syncCount = 0;
      entry.frames = 0;
      entry.acc = 0;
      entry.lastEmit = t;
      statListeners.forEach((l) => { try { l(stats); } catch {} });
    }
  };

  entry.remove = viewer.scene.postRender.addEventListener(tick);
  entries.set(viewer, entry);
  return entry;
}

/** Per-frame DOM sync tier. Runs only when the view or data changed. */
export function subscribeFrame(viewer: Viewer, fn: Fn): () => void {
  if (!viewer || viewer.isDestroyed()) return () => {};
  const e = ensure(viewer);
  e.frame.add(fn);
  e.dirty = true;
  return () => {
    e.frame.delete(fn);
    if (!e.frame.size && !e.slow.size) {
      try { e.remove(); } catch {}
      entries.delete(viewer);
    }
  };
}

/** ~4 Hz tier for cheap numeric readouts. */
export function subscribeSlow(viewer: Viewer, fn: Fn): () => void {
  if (!viewer || viewer.isDestroyed()) return () => {};
  const e = ensure(viewer);
  e.slow.add(fn);
  return () => {
    e.slow.delete(fn);
    if (!e.frame.size && !e.slow.size) {
      try { e.remove(); } catch {}
      entries.delete(viewer);
    }
  };
}
