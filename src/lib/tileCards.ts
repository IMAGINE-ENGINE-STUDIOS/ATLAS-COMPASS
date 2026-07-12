import { supabase } from "@/integrations/supabase/client";

export type TileIndicatorKind =
  | "topography"
  | "tomography"
  | "geology"
  | "seismic"
  | "hypocenters"
  | "plate-motion"
  | "bathymetry"
  | "landcover"
  | "custom-dataset"
  | "note";

export interface TileIndicator {
  id: string;
  kind: TileIndicatorKind;
  label: string;
  color: string;
  source?: string;
  url?: string;
  unit?: string;
  value?: number | string;
  meta?: Record<string, unknown>;
}

export interface TileCardRecord {
  id: string;
  owner_id: string;
  z: number;
  x: number;
  y: number;
  title: string | null;
  notes: string | null;
  center_lat: number | null;
  center_lng: number | null;
  indicators: TileIndicator[];
  metrics: Record<string, string | number>;
  tags: string[];
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export const INDICATOR_PRESETS: {
  kind: TileIndicatorKind;
  label: string;
  color: string;
  source?: string;
  unit?: string;
}[] = [
  { kind: "topography",     label: "Topography · SRTM",           color: "#8b6f47", source: "NASA SRTM v3",         unit: "m" },
  { kind: "bathymetry",     label: "Bathymetry · GEBCO",          color: "#3aa8ff", source: "GEBCO 2024",          unit: "m" },
  { kind: "tomography",     label: "Ground tomography",           color: "#c94f2b", source: "S40RTS / user upload", unit: "δVs %" },
  { kind: "geology",        label: "Surface geology",             color: "#ffb020", source: "USGS / OneGeology" },
  { kind: "seismic",        label: "Seismic section",             color: "#ff2d55", source: "SEG-Y bundle" },
  { kind: "hypocenters",    label: "Recent hypocenters",          color: "#ff6b3d", source: "USGS 30 d" },
  { kind: "plate-motion",   label: "Plate motion snapshot",       color: "#40e0ff", source: "NNR-MORVEL 2010",     unit: "mm/yr" },
  { kind: "landcover",      label: "Land cover · ESA WorldCover", color: "#5cff9d", source: "ESA WorldCover 2021" },
  { kind: "custom-dataset", label: "Custom dataset",              color: "#c9a26b" },
  { kind: "note",           label: "Field note",                  color: "#c9d6ff" },
];

const TABLE = "tile_cards";

export async function fetchTileCard(z: number, x: number, y: number) {
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id;
  if (!uid) return null;
  const { data, error } = await (supabase as any)
    .from(TABLE)
    .select("*")
    .eq("owner_id", uid)
    .eq("z", z).eq("x", x).eq("y", y)
    .maybeSingle();
  if (error) {
    console.warn("fetchTileCard failed", error);
    return null;
  }
  return data as TileCardRecord | null;
}

export async function upsertTileCard(input: {
  z: number; x: number; y: number;
  title?: string | null;
  notes?: string | null;
  center_lat?: number | null;
  center_lng?: number | null;
  indicators?: TileIndicator[];
  metrics?: Record<string, string | number>;
  tags?: string[];
  is_public?: boolean;
}) {
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id;
  if (!uid) throw new Error("Sign in required to save tile cards.");
  const payload = { owner_id: uid, ...input };
  const { data, error } = await (supabase as any)
    .from(TABLE)
    .upsert(payload, { onConflict: "owner_id,z,x,y" })
    .select("*")
    .single();
  if (error) throw error;
  return data as TileCardRecord;
}

export async function deleteTileCard(id: string) {
  const { error } = await (supabase as any).from(TABLE).delete().eq("id", id);
  if (error) throw error;
}

export function tileKeyOf(z: number, x: number, y: number) {
  return `${z}/${x}/${y}`;
}