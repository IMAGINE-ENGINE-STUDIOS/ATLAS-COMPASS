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
  url?: string;
}[] = [
  { kind: "topography",     label: "Topography · SRTM",           color: "#8b6f47", source: "NASA SRTM v3",         unit: "m" },
  { kind: "bathymetry",     label: "Bathymetry · GEBCO",          color: "#3aa8ff", source: "GEBCO 2024",          unit: "m" },
  { kind: "tomography",     label: "Tomography · IRIS EMC",       color: "#c94f2b", source: "IRIS Earth Model Collaboration (S40RTS, SEMUCB-WM1, GLAD-M25…)", unit: "δVs %", url: "http://ds.iris.edu/ds/products/emc-earthmodels/" },
  { kind: "tomography",     label: "Tomography · SubMachine",     color: "#a84fff", source: "Univ. of Oxford SubMachine mantle models", unit: "δVs %", url: "https://www.earth.ox.ac.uk/~smachine/cgi/index.php" },
  { kind: "geology",        label: "Surface geology",             color: "#ffb020", source: "USGS / OneGeology" },
  { kind: "seismic",        label: "Seismic section",             color: "#ff2d55", source: "SEG-Y bundle" },
  { kind: "hypocenters",    label: "Recent hypocenters",          color: "#ff6b3d", source: "USGS 30 d" },
  { kind: "plate-motion",   label: "Plate motion snapshot",       color: "#40e0ff", source: "NNR-MORVEL 2010",     unit: "mm/yr" },
  { kind: "landcover",      label: "Land cover · ESA WorldCover", color: "#5cff9d", source: "ESA WorldCover 2021" },
  { kind: "custom-dataset", label: "Custom dataset",              color: "#c9a26b" },
  { kind: "note",           label: "Field note",                  color: "#c9d6ff" },
];

/**
 * Real, published tomography model catalog. Thumbnails are hosted on
 * IRIS EMC (http://ds.iris.edu/ds/products/emc-earthmodels/); each entry
 * cites the primary reference and provides a landing URL that end users
 * can open to download the actual NetCDF / GeoCSV / GMT slices.
 */
export interface TomographyModel {
  id: string;
  hub: "IRIS EMC" | "SubMachine";
  name: string;
  authors: string;
  year: number;
  parameter: string;        // e.g. "Vs perturbation", "Vp perturbation"
  depthRangeKm: [number, number];
  parameterization: string; // e.g. "spherical harmonics ℓ≤40"
  reference: string;        // journal + DOI
  landingUrl: string;
  thumbUrl: string;
  color: string;
}

export const TOMOGRAPHY_MODELS: TomographyModel[] = [
  {
    id: "glad-m25",
    hub: "IRIS EMC",
    name: "GLAD-M25",
    authors: "Lei, Ruan, Bozdağ, Peter, Lefebvre, Komatitsch, Tromp et al.",
    year: 2020,
    parameter: "Vs, Vp perturbation (radially anisotropic)",
    depthRangeKm: [0, 2891],
    parameterization: "SEM adjoint tomography, ~17 km lateral",
    reference: "GJI 223 (1), 1–21 · doi:10.1093/gji/ggaa253",
    landingUrl: "http://ds.iris.edu/ds/products/emc-glad-m25/",
    thumbUrl: "http://ds.iris.edu/media/product/emc-glad-m25/images/GLAD-M25.png",
    color: "#c94f2b",
  },
  {
    id: "glad-m35",
    hub: "IRIS EMC",
    name: "GLAD-M35",
    authors: "Cui, Lei, Bozdağ, Peter, Komatitsch, Tromp",
    year: 2024,
    parameter: "Vs, Vp, radial anisotropy",
    depthRangeKm: [0, 2891],
    parameterization: "35 adjoint iterations, ~15 km lateral",
    reference: "GJI 239 (2), 1088–1109 · doi:10.1093/gji/ggae331",
    landingUrl: "http://ds.iris.edu/ds/products/emc-glad-m35/",
    thumbUrl: "http://ds.iris.edu/media/product/emc-glad-m35/images/GLAD-M35.png",
    color: "#e2723a",
  },
  {
    id: "semucb-wm1",
    hub: "IRIS EMC",
    name: "SEMUCB-WM1",
    authors: "French & Romanowicz",
    year: 2014,
    parameter: "Vs, radial anisotropy (ξ)",
    depthRangeKm: [0, 2891],
    parameterization: "SEM waveform, ~250 km lateral upper mantle",
    reference: "GJI 199, 1303–1327 · doi:10.1093/gji/ggu334",
    landingUrl: "http://ds.iris.edu/ds/products/emc-semucb-wm1/",
    thumbUrl: "http://ds.iris.edu/media/product/emc-semucb-wm1/images/semucb_vs_depth_70.png",
    color: "#a84fff",
  },
  {
    id: "s362ani",
    hub: "IRIS EMC",
    name: "S362ANI",
    authors: "Kustowski, Ekström, Dziewoński",
    year: 2008,
    parameter: "Vs, transverse isotropy",
    depthRangeKm: [0, 2891],
    parameterization: "spherical splines, degree 18 lateral",
    reference: "JGR 113, B06306 · doi:10.1029/2007JB005169",
    landingUrl: "http://ds.iris.edu/ds/products/emc-s362ani/",
    thumbUrl: "http://ds.iris.edu/media/product/emc-s362ani/images/S362ANI.jpg",
    color: "#7ac4ff",
  },
  {
    id: "llnl-g3dv3",
    hub: "IRIS EMC",
    name: "LLNL-G3Dv3",
    authors: "Simmons, Myers, Johannesson, Matzel",
    year: 2012,
    parameter: "Vp perturbation",
    depthRangeKm: [0, 2891],
    parameterization: "regionally adaptive tessellation, ~1° lateral",
    reference: "JGR 117, B10302 · doi:10.1029/2012JB009525",
    landingUrl: "http://ds.iris.edu/ds/products/emc-llnl-g3dv3/",
    thumbUrl: "http://ds.iris.edu/media/product/emc-llnl-g3dv3/images/LLNL-G3Dv3_UpperMantleModel_Iris.jpg",
    color: "#ffb020",
  },
  {
    id: "submachine-hub",
    hub: "SubMachine",
    name: "SubMachine (Oxford)",
    authors: "Hosseini, Matthews, Sigloch, Shephard, Domeier, Tsekhmistrenko",
    year: 2018,
    parameter: "50+ global P & S models, cross-sections & vote maps",
    depthRangeKm: [0, 2891],
    parameterization: "web viewer over IRIS + author-hosted grids",
    reference: "G-Cubed 19, 1464–1483 · doi:10.1029/2018GC007431",
    landingUrl: "https://www.earth.ox.ac.uk/~smachine/cgi/index.php",
    thumbUrl: "http://ds.iris.edu/media/product/emc-earthmodels/images/emc-earthmodels-thumb.png",
    color: "#a84fff",
  },
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

/** Fetch a tile card by id, only if it is publicly shared. Works signed-out. */
export async function fetchPublicTileCard(id: string) {
  const { data, error } = await (supabase as any)
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .eq("is_public", true)
    .maybeSingle();
  if (error) {
    console.warn("fetchPublicTileCard failed", error);
    return null;
  }
  return data as TileCardRecord | null;
}

export function tileKeyOf(z: number, x: number, y: number) {
  return `${z}/${x}/${y}`;
}