/**
 * BuildingCardRecord
 * ------------------
 * TypeScript representation of a row in `public.building_records`.
 * One record per (user, OSM building). Extends OSM feature properties
 * with user annotations (color, tag, notes, replacement 3D model, publish flag)
 * and a running ledger of change events (see BuildingLedgerEntry).
 */
export type BuildingLedgerKind =
  | "note"
  | "color"
  | "tag"
  | "model"
  | "publish"
  | "hide"
  | "import";

export interface BuildingLedgerEntry {
  id: string;
  record_id: string;
  user_id: string;
  kind: BuildingLedgerKind;
  message: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface BuildingCardRecord {
  id: string;
  user_id: string;
  /** Stable OSM identifier, e.g. "way/123456789". */
  osm_id: string;
  lat: number | null;
  lng: number | null;
  name: string | null;
  address: string | null;
  /** OSM `building=*` tag: yes, residential, commercial, church, etc. */
  building_kind: string | null;
  levels: number | null;
  footprint_m2: number | null;
  est_population: number | null;
  /** CSS hex string, e.g. "#22d3ee". */
  color: string | null;
  tag: string | null;
  notes: string | null;
  /** Signed URL for the replacement GLB (regenerated on demand). */
  replacement_glb_url: string | null;
  /** Storage object path inside the `building-models` bucket. */
  replacement_glb_path: string | null;
  is_hidden: boolean;
  is_public: boolean;
  raw: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/**
 * Ephemeral picked-building details, before it has been persisted as a record.
 * Emitted by AtlasBuildingsOverlay when the user clicks (or long-press adds)
 * an OSM building.
 */
export interface PickedBuilding {
  osm_id: string;
  lat: number;
  lng: number;
  /** Optional pre-known properties from the Cesium 3D Tile feature. */
  name?: string | null;
  address?: string | null;
  building_kind?: string | null;
  levels?: number | null;
  footprint_m2?: number | null;
  est_population?: number | null;
  /** Where est_population came from. */
  population_source?:
    | "us-census-2020"
    | "worldpop-2020"
    | "ghsl-2023"
    | "heuristic"
    | "unavailable"
    | null;
  /** Free-form human-readable explanation of the population estimate. */
  population_note?: string | null;
  raw?: Record<string, unknown>;
}

/** Population heuristic when OSM omits explicit residency data. */
export function estimatePopulation(input: {
  levels?: number | null;
  footprint_m2?: number | null;
  building_kind?: string | null;
}): number {
  const kind = (input.building_kind || "").toLowerCase();
  const residential =
    kind === "" ||
    kind === "yes" ||
    kind === "residential" ||
    kind === "apartments" ||
    kind === "house" ||
    kind === "dormitory" ||
    kind === "hotel";
  if (!residential) return 0;
  const floors = Math.max(1, Math.floor(input.levels ?? 3));
  // ~35 m² per resident is a common planning heuristic for European cities.
  const perFloor = input.footprint_m2 ? Math.max(1, Math.floor(input.footprint_m2 / 35)) : 4;
  return floors * perFloor;
}