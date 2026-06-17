import { EMPTY_SCENE, LevelScene } from "@/lib/levelTypes";

export interface LocalLevelRecord {
  id: string;
  name: string;
  description: string | null;
  thumbnail_url: string | null;
  is_public: boolean;
  updated_at: string;
  created_at: string;
  owner_id: string;
  scene: LevelScene;
}

const LEVELS_KEY = "startupfactoryhub:local-levels:v1";
const OWNER_KEY = "startupfactoryhub:local-level-owner:v1";

const cloneScene = (scene: LevelScene): LevelScene => JSON.parse(JSON.stringify(scene));

export function isLocalLevelId(id: string | undefined | null): id is string {
  return typeof id === "string" && id.startsWith("local_");
}

export function getLocalLevelOwnerId(): string {
  try {
    const existing = window.localStorage.getItem(OWNER_KEY);
    if (existing) return existing;
    const next = `local_owner_${crypto.randomUUID()}`;
    window.localStorage.setItem(OWNER_KEY, next);
    return next;
  } catch {
    return "local_owner_fallback";
  }
}

function readLocalLevels(): LocalLevelRecord[] {
  try {
    const raw = window.localStorage.getItem(LEVELS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalLevels(levels: LocalLevelRecord[]) {
  window.localStorage.setItem(LEVELS_KEY, JSON.stringify(levels));
}

export function listLocalLevels(): LocalLevelRecord[] {
  return readLocalLevels().sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
}

export function getLocalLevel(id: string): LocalLevelRecord | null {
  return readLocalLevels().find((level) => level.id === id) ?? null;
}

export function createLocalLevel(scene: LevelScene = EMPTY_SCENE): LocalLevelRecord {
  const now = new Date().toISOString();
  const level: LocalLevelRecord = {
    id: `local_${crypto.randomUUID()}`,
    name: "Untitled Level",
    description: null,
    thumbnail_url: null,
    is_public: false,
    updated_at: now,
    created_at: now,
    owner_id: getLocalLevelOwnerId(),
    scene: cloneScene(scene),
  };
  writeLocalLevels([level, ...readLocalLevels()]);
  return level;
}

export function updateLocalLevel(id: string, patch: Partial<Omit<LocalLevelRecord, "id" | "created_at" | "owner_id">>) {
  const levels = readLocalLevels();
  const index = levels.findIndex((level) => level.id === id);
  if (index < 0) return false;
  levels[index] = { ...levels[index], ...patch, updated_at: new Date().toISOString() };
  writeLocalLevels(levels);
  return true;
}

export function deleteLocalLevel(id: string) {
  writeLocalLevels(readLocalLevels().filter((level) => level.id !== id));
}