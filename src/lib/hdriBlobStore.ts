import type { LevelScene, HDRIMap } from "./levelTypes";

// HDRI files are multi-megabyte. Persisting them inline inside `levels.scene`
// blows past PostgREST's request size limit and the autosave PATCH fails, so
// we keep the heavy data URLs in client-side storage and persist only a
// lightweight reference in the JSON that ships to the database.
//
// localStorage caps out around 5–10 MB per origin and silently fails for a
// single HDRI, which is why lighting kept disappearing after reloads. We use
// IndexedDB as the primary store (effectively unbounded for our purposes) and
// fall back to localStorage only when IDB is unavailable.

const DB_NAME = "startupfactoryhub:hdri-blobs";
const DB_VERSION = 1;
const STORE = "blobs";
const LS_KEY = (levelId: string) => `level:${levelId}:hdri-blobs`;
const PLACEHOLDER = "local:";

function isHeavy(url: string | undefined): boolean {
  return !!url && url.startsWith("data:") && url.length > 200_000;
}

type BlobRecord = { id: string; levelId: string; mapId: string; url: string; ext: HDRIMap["ext"] };
type BlobMap = Record<string, { url: string; ext: HDRIMap["ext"] }>;

// In-memory mirror keyed by levelId so repeated read/writes don't hit IDB
// every time (autosave fires every keystroke).
const memory = new Map<string, BlobMap>();

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: "id" });
          store.createIndex("levelId", "levelId", { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function loadFromIdb(levelId: string): Promise<BlobMap> {
  const db = await openDb();
  if (!db) return {};
  return new Promise<BlobMap>((resolve) => {
    try {
      const t = db.transaction(STORE, "readonly");
      const idx = t.objectStore(STORE).index("levelId");
      const req = idx.getAll(IDBKeyRange.only(levelId));
      req.onsuccess = () => {
        const out: BlobMap = {};
        for (const r of (req.result as BlobRecord[]) ?? []) {
          out[r.mapId] = { url: r.url, ext: r.ext };
        }
        resolve(out);
      };
      req.onerror = () => resolve({});
    } catch {
      resolve({});
    }
  });
}

async function writeToIdb(levelId: string, mapId: string, url: string, ext: HDRIMap["ext"]): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  return new Promise<boolean>((resolve) => {
    try {
      const t = db.transaction(STORE, "readwrite");
      t.objectStore(STORE).put({ id: `${levelId}::${mapId}`, levelId, mapId, url, ext });
      t.oncomplete = () => resolve(true);
      t.onerror = () => resolve(false);
      t.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

function readLsFallback(levelId: string): BlobMap {
  try {
    const raw = localStorage.getItem(LS_KEY(levelId));
    return raw ? (JSON.parse(raw) as BlobMap) : {};
  } catch {
    return {};
  }
}

function writeLsFallback(levelId: string, map: BlobMap) {
  try {
    localStorage.setItem(LS_KEY(levelId), JSON.stringify(map));
  } catch {
    /* quota — IDB is the real store */
  }
}

/** Warm the in-memory cache for a level. Call once per level load. */
export async function preloadHdriBlobs(levelId: string): Promise<void> {
  const fromIdb = await loadFromIdb(levelId);
  const fromLs = readLsFallback(levelId);
  // IDB wins on conflicts (it's the source of truth going forward).
  memory.set(levelId, { ...fromLs, ...fromIdb });
}

/** Persist a single HDRI blob immediately, before any save runs. */
export async function persistHdriBlob(
  levelId: string,
  mapId: string,
  url: string,
  ext: HDRIMap["ext"],
): Promise<void> {
  const cache = memory.get(levelId) ?? {};
  cache[mapId] = { url, ext };
  memory.set(levelId, cache);
  const ok = await writeToIdb(levelId, mapId, url, ext);
  if (!ok) writeLsFallback(levelId, cache);
}

/** Strip heavy HDRI data URLs out of the scene before it's saved to the DB. */
export function stripHdriBlobs(levelId: string, scene: LevelScene): LevelScene {
  const hdri = scene.environment?.hdri;
  if (!hdri?.maps?.length) return scene;
  const cache = memory.get(levelId) ?? {};
  let changed = false;
  const maps = hdri.maps.map((m) => {
    if (isHeavy(m.url)) {
      if (!cache[m.id]) {
        cache[m.id] = { url: m.url, ext: m.ext };
        // Fire-and-forget durable write (await not needed — autosave is async).
        writeToIdb(levelId, m.id, m.url, m.ext).then((ok) => {
          if (!ok) writeLsFallback(levelId, cache);
        });
      }
      changed = true;
      return { ...m, url: `${PLACEHOLDER}${m.id}` };
    }
    return m;
  });
  if (changed) memory.set(levelId, cache);
  return {
    ...scene,
    environment: { ...scene.environment, hdri: { ...hdri, maps } },
  };
}

/**
 * Re-attach HDRI data URLs after loading a scene. Async — pulls from IDB
 * (the durable store) with a localStorage fallback for legacy levels.
 */
export async function rehydrateHdriBlobs(levelId: string, scene: LevelScene): Promise<LevelScene> {
  const hdri = scene.environment?.hdri;
  if (!hdri?.maps?.length) return scene;
  let cache = memory.get(levelId);
  if (!cache) {
    await preloadHdriBlobs(levelId);
    cache = memory.get(levelId) ?? {};
  }
  const maps = hdri.maps.map((m) => {
    if (m.url?.startsWith(PLACEHOLDER)) {
      const blob = cache![m.id];
      if (blob) return { ...m, url: blob.url, ext: blob.ext };
    }
    return m;
  });
  return {
    ...scene,
    environment: { ...scene.environment, hdri: { ...hdri, maps } },
  };
}