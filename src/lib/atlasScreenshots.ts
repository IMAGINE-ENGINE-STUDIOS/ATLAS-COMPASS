/**
 * Atlas Screenshot Capture & Gallery
 * ----------------------------------
 * Captures the Cesium viewer at the highest fidelity the GPU can render
 * (temporary resolutionScale boost + supersampled MSAA), then persists the
 * resulting frame to IndexedDB so users can recall it later from the
 * camera-icon dropdown gallery in the Atlas HUD.
 *
 * Industry-standard outputs supported:
 *   - image/jpeg (quality 0.98)  → primary download
 *   - image/png  (lossless)      → also stored, optional download
 *   - image/webp (quality 0.95)  → space-efficient gallery thumbnail
 */

import type { Viewer } from "cesium";

const DB_NAME = "atlas-screenshots";
const STORE = "shots";
const DB_VERSION = 1;

export interface AtlasShot {
  id: string;
  createdAt: number;
  width: number;
  height: number;
  /** Display label, e.g. "Atlas — 22 Jun 2026 14:32" */
  label: string;
  /** Full-quality JPEG (download payload) */
  jpeg: Blob;
  /** Lossless PNG (industry archival) */
  png: Blob;
  /** Small WebP thumbnail for the gallery grid */
  thumb: Blob;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function listShots(): Promise<AtlasShot[]> {
  const all = await tx<AtlasShot[]>("readonly", (s) => s.getAll() as IDBRequest<AtlasShot[]>);
  return [...all].sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteShot(id: string): Promise<void> {
  await tx<undefined>("readwrite", (s) => s.delete(id) as IDBRequest<undefined>);
}

async function putShot(shot: AtlasShot): Promise<void> {
  await tx<IDBValidKey>("readwrite", (s) => s.put(shot));
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob returned null"))),
      type,
      quality,
    );
  });
}

function fmtLabel(d: Date) {
  return `Atlas — ${d.toLocaleString(undefined, {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  })}`;
}

/**
 * Capture the current Cesium frame at the highest possible quality.
 * Temporarily boosts resolutionScale (supersampling) so the saved image
 * exceeds the on-screen pixel density, then restores the prior state.
 */
export async function captureAtlasShot(
  viewer: Viewer,
  opts: { supersample?: number } = {},
): Promise<AtlasShot> {
  const ss = Math.max(1, Math.min(opts.supersample ?? 2, 4));

  const scene = viewer.scene;
  const prevScale = viewer.resolutionScale;
  const prevPreserve = (scene as any)?.canvas?.getContext?.("webgl2") ?? null;
  // Force preserveDrawingBuffer-equivalent path: render synchronously and
  // read the canvas immediately after.
  try {
    viewer.resolutionScale = ss;
    // Render twice to let post-FX settle (FXAA / globe tiles).
    scene.requestRender();
    (scene as any).render?.();
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    (scene as any).render?.();

    const src = scene.canvas as HTMLCanvasElement;
    const width = src.width;
    const height = src.height;

    // Copy to an offscreen 2D canvas — Cesium's WebGL canvas is not
    // toBlob-friendly without preserveDrawingBuffer, but drawImage works
    // immediately after a synchronous render call.
    const out = document.createElement("canvas");
    out.width = width;
    out.height = height;
    const ctx = out.getContext("2d");
    if (!ctx) throw new Error("2D context unavailable");
    ctx.drawImage(src, 0, 0, width, height);

    const [jpeg, png] = await Promise.all([
      canvasToBlob(out, "image/jpeg", 0.98),
      canvasToBlob(out, "image/png"),
    ]);

    // Thumbnail — long edge 480px.
    const tScale = Math.min(1, 480 / Math.max(width, height));
    const tw = Math.max(1, Math.round(width * tScale));
    const th = Math.max(1, Math.round(height * tScale));
    const tCanvas = document.createElement("canvas");
    tCanvas.width = tw;
    tCanvas.height = th;
    tCanvas.getContext("2d")!.drawImage(out, 0, 0, tw, th);
    const thumb = await canvasToBlob(tCanvas, "image/webp", 0.85)
      .catch(() => canvasToBlob(tCanvas, "image/jpeg", 0.85));

    const shot: AtlasShot = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: Date.now(),
      width,
      height,
      label: fmtLabel(new Date()),
      jpeg,
      png,
      thumb,
    };
    await putShot(shot);
    return shot;
  } finally {
    viewer.resolutionScale = prevScale;
    void prevPreserve;
    viewer.scene.requestRender();
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function shotFilename(shot: AtlasShot, ext: "jpg" | "png") {
  const d = new Date(shot.createdAt);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `atlas_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.${ext}`;
}