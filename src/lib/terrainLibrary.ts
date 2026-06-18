import type { SceneTerrain } from "./levelTypes";
import { defaultTerrain } from "./levelTypes";

/**
 * Saved terrain library. Persists user-created terrain presets in
 * localStorage so they can be reused across levels.
 *
 * Each entry is a {@link SceneTerrain} snapshot (geometry, material,
 * texture, sculpted heightmap, etc.) plus a human name and a thumbnail
 * preview color derived from the terrain's base color.
 */

export interface TerrainPreset {
  id: string;
  name: string;
  createdAt: number;
  builtIn?: boolean;
  terrain: SceneTerrain;
}

const LS_KEY = "lovable.terrainLibrary.v1";

function rgba(r: number, g: number, b: number, a = 1): [number, number, number, number] {
  return [r, g, b, a];
}

function mkPreset(name: string, patch: Partial<SceneTerrain>): TerrainPreset {
  return {
    id: `builtin_${name.toLowerCase().replace(/\s+/g, "_")}`,
    name,
    createdAt: 0,
    builtIn: true,
    terrain: { ...defaultTerrain(), enabled: true, ...patch },
  };
}

export const BUILT_IN_TERRAINS: TerrainPreset[] = [
  mkPreset("Grass plane", {
    shape: "plane",
    size: [40, 1, 40],
    color: rgba(0.32, 0.55, 0.28),
  }),
  mkPreset("Sand desert", {
    shape: "plane",
    size: [60, 1, 60],
    color: rgba(0.86, 0.74, 0.48),
  }),
  mkPreset("Snow field", {
    shape: "plane",
    size: [50, 1, 50],
    color: rgba(0.93, 0.95, 0.98),
    material: { metalness: 0.0, roughness: 0.85, reflectivity: 0.4, preset: "custom" },
  }),
  mkPreset("Rocky stone", {
    shape: "box",
    size: [30, 2, 30],
    color: rgba(0.45, 0.45, 0.48),
    material: { metalness: 0.05, roughness: 0.95, reflectivity: 0.5, preset: "stone" },
  }),
  mkPreset("Ocean", {
    shape: "plane",
    size: [80, 1, 80],
    color: rgba(0.12, 0.32, 0.55),
    material: { metalness: 0.2, roughness: 0.15, reflectivity: 1.5, preset: "custom" },
  }),
  mkPreset("Dark asphalt", {
    shape: "plane",
    size: [30, 1, 30],
    color: rgba(0.12, 0.12, 0.14),
    material: { metalness: 0.0, roughness: 0.9, reflectivity: 0.3, preset: "custom" },
  }),
];

export function loadSavedTerrains(): TerrainPreset[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as TerrainPreset[];
  } catch {
    return [];
  }
}

function writeSaved(list: TerrainPreset[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(list));
  } catch (e) {
    console.warn("[terrainLibrary] failed to persist", e);
  }
}

export function saveTerrain(name: string, terrain: SceneTerrain): TerrainPreset {
  const entry: TerrainPreset = {
    id: `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    name: name.trim() || "Untitled terrain",
    createdAt: Date.now(),
    terrain: { ...terrain },
  };
  const list = loadSavedTerrains();
  list.unshift(entry);
  writeSaved(list);
  return entry;
}

export function deleteSavedTerrain(id: string) {
  writeSaved(loadSavedTerrains().filter((p) => p.id !== id));
}

export function renameSavedTerrain(id: string, name: string) {
  const list = loadSavedTerrains().map((p) =>
    p.id === id ? { ...p, name: name.trim() || p.name } : p,
  );
  writeSaved(list);
}

export function previewColor(p: TerrainPreset): string {
  const [r, g, b] = p.terrain.color;
  const to = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}