// Tiny pub/sub store for runtime performance metrics. Lives outside React so
// the in-Canvas sampler can push values every frame without re-rendering the
// scene tree. The HUD subscribes and re-renders itself in isolation.

export type PerfSnapshot = {
  fps: number;
  ms: number;          // EWMA frame time in milliseconds
  calls: number;       // gl.info.render.calls
  tris: number;        // gl.info.render.triangles
  programs: number;    // gl.info.programs?.length
  textures: number;    // gl.info.memory.textures
  geometries: number;  // gl.info.memory.geometries
  heapMB: number | null; // performance.memory.usedJSHeapSize / 1e6, when available
};

const initial: PerfSnapshot = {
  fps: 0,
  ms: 0,
  calls: 0,
  tris: 0,
  programs: 0,
  textures: 0,
  geometries: 0,
  heapMB: null,
};

let snapshot: PerfSnapshot = initial;
const listeners = new Set<(s: PerfSnapshot) => void>();

export function getPerfSnapshot(): PerfSnapshot {
  return snapshot;
}

export function setPerfSnapshot(next: PerfSnapshot): void {
  snapshot = next;
  for (const l of listeners) l(snapshot);
}

export function subscribePerf(listener: (s: PerfSnapshot) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}