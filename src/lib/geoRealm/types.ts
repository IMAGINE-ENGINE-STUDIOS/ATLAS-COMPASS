/**
 * Geo Realm — shared types for subsurface bundles rendered in Atlas
 * and edited in the /geo-realm workbench.
 */

export type GeoRealmKind =
  | "plates"
  | "faults"
  | "slab"
  | "crust"
  | "seismic"
  | "tomography"
  | "bathymetry"
  | "cad"
  | "custom";

export interface GeoRealmBundle {
  id: string;
  owner_id: string | null;
  name: string;
  kind: GeoRealmKind;
  description: string | null;
  bbox: { west: number; south: number; east: number; north: number } | null;
  depth_range: { min_km: number; max_km: number } | null;
  source_meta: Record<string, unknown>;
  layers: GeoRealmLayerSpec[];
  manifest_url: string | null;
  thumbnail_url: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export interface GeoRealmLayerSpec {
  id: string;
  kind: GeoRealmKind;
  label: string;
  visible: boolean;
  /** Color, hex. */
  color?: string;
  /** Fetchable URL for GeoJSON / glTF / KTX2 / PNG panels. */
  url?: string;
  /** Free-form metadata rendered in the inspector. */
  meta?: Record<string, unknown>;
}

/** Canonical (prefetched) datasets served at runtime from public sources. */
export interface CanonicalDataset {
  id: string;
  kind: GeoRealmKind;
  label: string;
  citation: string;
  url: string;
  color: string;
  description: string;
}