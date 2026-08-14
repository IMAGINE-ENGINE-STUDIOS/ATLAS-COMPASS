import { WorldConfig, WorldMetrics, EMPTY_METRICS, defaultWorldConfig } from "./types";

export interface LocalWorldRecord {
  id: string;
  name: string;
  description: string | null;
  thumbnail_url: string | null;
  is_public: boolean;
  updated_at: string;
  created_at: string;
  owner_id: string;
  config: WorldConfig;
  metrics: WorldMetrics;
  weights_ref: string | null;
}

const KEY = "imagineengine:local-world-models:v1";
const OWNER_KEY = "imagineengine:local-world-owner:v1";

export function isLocalWorldId(id: string | undefined | null): id is string {
  return typeof id === "string" && id.startsWith("localw_");
}

export function getLocalWorldOwnerId(): string {
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

function read(): LocalWorldRecord[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(rows: LocalWorldRecord[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(rows));
  } catch (err) {
    console.warn("[localWorlds] write failed", err);
  }
}

export function listLocalWorlds(): LocalWorldRecord[] {
  return read().sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
}

export function getLocalWorld(id: string): LocalWorldRecord | null {
  return read().find((r) => r.id === id) ?? null;
}

export function createLocalWorld(patch?: Partial<LocalWorldRecord>): LocalWorldRecord {
  const now = new Date().toISOString();
  const row: LocalWorldRecord = {
    id: `localw_${crypto.randomUUID()}`,
    name: "Untitled World",
    description: null,
    thumbnail_url: null,
    is_public: false,
    updated_at: now,
    created_at: now,
    owner_id: getLocalWorldOwnerId(),
    config: defaultWorldConfig(),
    metrics: { ...EMPTY_METRICS },
    weights_ref: null,
    ...patch,
  };
  write([row, ...read()]);
  return row;
}

export function updateLocalWorld(id: string, patch: Partial<LocalWorldRecord>) {
  const rows = read();
  const i = rows.findIndex((r) => r.id === id);
  if (i < 0) return false;
  rows[i] = { ...rows[i], ...patch, updated_at: new Date().toISOString() };
  write(rows);
  return true;
}

export function deleteLocalWorld(id: string) {
  write(read().filter((r) => r.id !== id));
}
