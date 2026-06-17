import type { LevelScene, HDRIMap } from "./levelTypes";

// HDRI files are multi-megabyte. Persisting them inline inside `levels.scene`
// blows past PostgREST's request size limit and the autosave PATCH fails.
// We keep the heavy data URLs in localStorage (per level) and store only a
// lightweight reference in the JSON that ships to the database.

const KEY = (levelId: string) => `level:${levelId}:hdri-blobs`;
const PLACEHOLDER = "local:";

function isHeavy(url: string | undefined): boolean {
  return !!url && url.startsWith("data:") && url.length > 200_000;
}

type BlobMap = Record<string, { url: string; ext: HDRIMap["ext"] }>;

function readStore(levelId: string): BlobMap {
  try {
    const raw = localStorage.getItem(KEY(levelId));
    return raw ? (JSON.parse(raw) as BlobMap) : {};
  } catch {
    return {};
  }
}

function writeStore(levelId: string, map: BlobMap) {
  try {
    localStorage.setItem(KEY(levelId), JSON.stringify(map));
  } catch (e) {
    console.warn("[hdri] failed to persist HDRI blob locally", e);
  }
}

/** Strip heavy HDRI data URLs out of the scene before it's saved to the DB. */
export function stripHdriBlobs(levelId: string, scene: LevelScene): LevelScene {
  const hdri = scene.environment?.hdri;
  if (!hdri?.maps?.length) return scene;
  const store = readStore(levelId);
  let changed = false;
  const maps = hdri.maps.map((m) => {
    if (isHeavy(m.url)) {
      store[m.id] = { url: m.url, ext: m.ext };
      changed = true;
      return { ...m, url: `${PLACEHOLDER}${m.id}` };
    }
    return m;
  });
  if (changed) writeStore(levelId, store);
  return {
    ...scene,
    environment: { ...scene.environment, hdri: { ...hdri, maps } },
  };
}

/** Re-attach HDRI data URLs after loading a scene from the DB. */
export function rehydrateHdriBlobs(levelId: string, scene: LevelScene): LevelScene {
  const hdri = scene.environment?.hdri;
  if (!hdri?.maps?.length) return scene;
  const store = readStore(levelId);
  const maps = hdri.maps.map((m) => {
    if (m.url?.startsWith(PLACEHOLDER)) {
      const blob = store[m.id];
      if (blob) return { ...m, url: blob.url, ext: blob.ext };
    }
    return m;
  });
  return {
    ...scene,
    environment: { ...scene.environment, hdri: { ...hdri, maps } },
  };
}