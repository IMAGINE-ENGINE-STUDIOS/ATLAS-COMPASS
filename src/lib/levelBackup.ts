/**
 * Level backup safety net.
 *
 * Persistence priorities, in order:
 *   1. Append-only IndexedDB snapshot — survives refreshes, crashes, network
 *      failures and older cloud/local versions. It is always written BEFORE the
 *      primary save so a failed or stale save never loses data.
 *   2. Primary save (cloud `levels` row OR `localStorage` for local drafts).
 *   3. localStorage mirror of the last snapshot metadata so we can detect that
 *      a newer memory exists even if IDB is temporarily unavailable.
 */
import type { LevelScene } from "@/lib/levelTypes";

const DB_NAME = "startupfactoryhub:level-backups";
const DB_VERSION = 1;
const STORE = "snapshots";
const META_KEY_PREFIX = "startupfactoryhub:level-backup-meta:";

export interface LevelSnapshot {
  id: string;
  levelId: string;
  savedAt: number;
  committed: boolean;
  name: string;
  description: string | null;
  isPublic: boolean;
  scene: LevelScene;
}

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
          store.createIndex("savedAt", "savedAt", { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        console.warn("[levelBackup] open failed", req.error);
        resolve(null);
      };
    } catch (err) {
      console.warn("[levelBackup] open threw", err);
      resolve(null);
    }
  });
}

function writeMetaMirror(snap: LevelSnapshot) {
  try {
    window.localStorage.setItem(
      META_KEY_PREFIX + snap.levelId,
      JSON.stringify({ savedAt: snap.savedAt, committed: snap.committed }),
    );
  } catch {
    /* ignore quota — IDB remains source of truth */
  }
}

function readMetaMirror(levelId: string): { savedAt: number; committed: boolean } | null {
  try {
    const raw = window.localStorage.getItem(META_KEY_PREFIX + levelId);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function writeSnapshot(snap: Omit<LevelSnapshot, "id">): Promise<boolean> {
  const full: LevelSnapshot = { ...snap, id: `${snap.levelId}::${snap.savedAt}` };
  writeMetaMirror(full);
  const db = await openDb();
  if (!db) return false;
  return new Promise<boolean>((resolve) => {
    try {
      const t = db.transaction(STORE, "readwrite");
      const store = t.objectStore(STORE);
      store.put(full);
      t.oncomplete = () => {
        resolve(true);
      };
      t.onerror = () => resolve(false);
      t.onabort = () => resolve(false);
    } catch (err) {
      console.warn("[levelBackup] writeSnapshot failed", err);
      resolve(false);
    }
  });
}

export async function markCommitted(levelId: string, savedAt: number): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const t = db.transaction(STORE, "readwrite");
      const store = t.objectStore(STORE);
      const id = `${levelId}::${savedAt}`;
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const existing = getReq.result as LevelSnapshot | undefined;
        if (existing) {
          existing.committed = true;
          store.put(existing);
          writeMetaMirror(existing);
        }
      };
      t.oncomplete = () => resolve();
      t.onerror = () => resolve();
      t.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function listSnapshots(levelId: string): Promise<LevelSnapshot[]> {
  const db = await openDb();
  if (!db) return [];
  return new Promise<LevelSnapshot[]>((resolve) => {
    try {
      const t = db.transaction(STORE, "readonly");
      const store = t.objectStore(STORE);
      const idx = store.index("levelId");
      const req = idx.getAll(IDBKeyRange.only(levelId));
      req.onsuccess = () => {
        const list = (req.result as LevelSnapshot[]) ?? [];
        list.sort((a, b) => b.savedAt - a.savedAt);
        resolve(list);
      };
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

export async function latestSnapshot(levelId: string): Promise<LevelSnapshot | null> {
  const list = await listSnapshots(levelId);
  return list[0] ?? null;
}

export function hasUncommittedMirror(levelId: string): boolean {
  const meta = readMetaMirror(levelId);
  return !!meta && !meta.committed;
}

export async function deleteAllSnapshots(levelId: string): Promise<void> {
  const all = await listSnapshots(levelId);
  const db = await openDb();
  if (!db) return;
  try {
    const t = db.transaction(STORE, "readwrite");
    const store = t.objectStore(STORE);
    all.forEach((s) => store.delete(s.id));
  } catch {
    /* ignore */
  }
  try {
    window.localStorage.removeItem(META_KEY_PREFIX + (levelId));
  } catch {
    /* ignore */
  }
}
