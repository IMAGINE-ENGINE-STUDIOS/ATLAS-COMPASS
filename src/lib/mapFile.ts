/**
 * MapFile (.map)
 * --------------
 * A MAP is the portable, file-group representation of what used to be a
 * standalone "Level". One MAP carries:
 *
 *   - A geographic anchor (lat / lng / altitude / heading on the globe).
 *   - The full scene payload (`LevelScene`): geometry, models, characters,
 *     terrain, splines, train, lights, HDRI, behaviors — everything the
 *     existing Level editor authored.
 *   - Optional configuration: name, description, original level id.
 *
 * On import, a MAP is unfolded directly into the Atlas world at its anchor —
 * no separate /level/:id streaming, no extra R3F canvas per placement.
 *
 * On disk, two formats are supported:
 *
 *   1. `.map`     — plain JSON. The simplest case (no bundled binary assets;
 *                   models / textures / HDRI live at URLs that survive
 *                   sharing — e.g. https URLs, supabase storage URLs).
 *   2. `.lvlpkg`  — zipped binary package (handled by `levelPackage.ts`).
 *                   Use when bundling private GLBs, HDRIs, textures, etc.
 *
 * This module owns the JSON variant. Round-trip with the existing
 * `levelPackage.ts` is delegated when callers pass `.lvlpkg` bytes.
 */

import type { LevelScene } from "./levelTypes";
import { EMPTY_SCENE } from "./levelTypes";

export const MAP_FILE_VERSION = 1;
export const MAP_FILE_MIME = "application/x-lovable-map+json";
export const MAP_FILE_EXT = ".map";

export interface MapAnchor {
  /** Latitude in degrees (WGS84). */
  lat: number;
  /** Longitude in degrees (WGS84). */
  lng: number;
  /** Altitude in meters above the ellipsoid. */
  alt: number;
  /** Yaw in degrees, clockwise from north. */
  heading: number;
  /** Uniform scale of the placed scene (default 1). */
  scale?: number;
}

export interface MapFile {
  /** Marker tag so a JSON.parse round-trip can sanity-check the file. */
  kind: "lovable.map";
  version: typeof MAP_FILE_VERSION;
  /** Stable id of the source level row, if exported from one. */
  sourceLevelId?: string;
  name: string;
  description?: string;
  exportedAt: string; // ISO timestamp
  anchor: MapAnchor;
  scene: LevelScene;
}

export interface ExportMapInput {
  name: string;
  description?: string;
  sourceLevelId?: string;
  anchor: MapAnchor;
  scene: LevelScene;
}

/** Serialize a MAP to a UTF-8 JSON Blob ready for download. */
export function exportMapJson(input: ExportMapInput): Blob {
  const file: MapFile = {
    kind: "lovable.map",
    version: MAP_FILE_VERSION,
    sourceLevelId: input.sourceLevelId,
    name: input.name.trim() || "Untitled Map",
    description: input.description?.trim() || undefined,
    exportedAt: new Date().toISOString(),
    anchor: normalizeAnchor(input.anchor),
    scene: input.scene ?? { ...EMPTY_SCENE },
  };
  return new Blob([JSON.stringify(file, null, 2)], { type: MAP_FILE_MIME });
}

/** Suggest a filesystem-safe filename, e.g. `central-park.map`. */
export function suggestMapFilename(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "map";
  return `${slug}${MAP_FILE_EXT}`;
}

/** Parse a MAP from a File / Blob / string / ArrayBuffer. Throws on bad input. */
export async function importMapJson(source: File | Blob | string | ArrayBuffer): Promise<MapFile> {
  const text =
    typeof source === "string"
      ? source
      : source instanceof ArrayBuffer
        ? new TextDecoder("utf-8").decode(source)
        : await source.text();

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err: any) {
    throw new Error(`Not a valid MAP file (invalid JSON): ${err?.message ?? err}`);
  }

  return coerceMapFile(parsed);
}

/**
 * Loose validator + migrator. Accepts:
 *   - a `MapFile`
 *   - a raw `LevelScene` (legacy export from the Level editor; we'll wrap it
 *     with a default anchor that the caller must override on import)
 *   - a `{ name?, scene }` mini-shape produced by old tools
 */
export function coerceMapFile(input: unknown): MapFile {
  if (input == null || typeof input !== "object") {
    throw new Error("Not a valid MAP file (expected JSON object).");
  }
  const obj = input as Record<string, any>;

  // Already a MapFile? Trust the shape after a couple of cheap checks.
  if (obj.kind === "lovable.map" && obj.scene && obj.anchor) {
    const anchor = normalizeAnchor(obj.anchor as MapAnchor);
    return {
      kind: "lovable.map",
      version: typeof obj.version === "number" ? obj.version : MAP_FILE_VERSION,
      sourceLevelId: obj.sourceLevelId,
      name: typeof obj.name === "string" && obj.name.trim() ? obj.name : "Untitled Map",
      description: typeof obj.description === "string" ? obj.description : undefined,
      exportedAt: typeof obj.exportedAt === "string" ? obj.exportedAt : new Date().toISOString(),
      anchor,
      scene: mergeScene(obj.scene as Partial<LevelScene>),
    };
  }

  // Raw scene? (Level editor "Save scene as JSON" path.)
  if (Array.isArray(obj.objects) && obj.environment) {
    return {
      kind: "lovable.map",
      version: MAP_FILE_VERSION,
      name: typeof obj.name === "string" && obj.name.trim() ? obj.name : "Imported Map",
      exportedAt: new Date().toISOString(),
      anchor: defaultAnchor(),
      scene: mergeScene(obj as Partial<LevelScene>),
    };
  }

  // `{ name?, scene }` wrapper.
  if (obj.scene && typeof obj.scene === "object") {
    return {
      kind: "lovable.map",
      version: MAP_FILE_VERSION,
      name: typeof obj.name === "string" && obj.name.trim() ? obj.name : "Imported Map",
      description: typeof obj.description === "string" ? obj.description : undefined,
      exportedAt: new Date().toISOString(),
      anchor: defaultAnchor(),
      scene: mergeScene(obj.scene as Partial<LevelScene>),
    };
  }

  throw new Error("Not a valid MAP file (missing `scene`).");
}

function normalizeAnchor(a: MapAnchor): MapAnchor {
  return {
    lat: clampLat(Number(a?.lat ?? 0)),
    lng: wrapLng(Number(a?.lng ?? 0)),
    alt: Number.isFinite(a?.alt) ? Number(a.alt) : 0,
    heading: ((Number(a?.heading ?? 0) % 360) + 360) % 360,
    scale: a?.scale && a.scale > 0 ? a.scale : 1,
  };
}

function defaultAnchor(): MapAnchor {
  return { lat: 0, lng: 0, alt: 0, heading: 0, scale: 1 };
}

function mergeScene(scene: Partial<LevelScene> | null | undefined): LevelScene {
  return { ...EMPTY_SCENE, ...(scene ?? {}) } as LevelScene;
}

function clampLat(lat: number): number {
  if (Number.isNaN(lat)) return 0;
  return Math.max(-90, Math.min(90, lat));
}

function wrapLng(lng: number): number {
  if (Number.isNaN(lng)) return 0;
  let v = lng;
  while (v > 180) v -= 360;
  while (v < -180) v += 360;
  return v;
}

/** Trigger a browser download for a MAP blob. */
export function downloadMap(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Free the object URL on the next tick so the click has time to flush.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Recognize a file the user picked as a MAP candidate (.map / .json). */
export function looksLikeMapFilename(name: string): boolean {
  const n = name.toLowerCase();
  return n.endsWith(MAP_FILE_EXT) || n.endsWith(".json");
}