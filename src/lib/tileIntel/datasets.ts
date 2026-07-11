import { supabase } from "@/integrations/supabase/client";

export type DatasetKind = "geojson" | "kml" | "shp" | "csv" | "geotiff" | "netcdf" | "gpx" | "json" | "model";

export interface UserDataset {
  id: string;
  owner_id: string;
  name: string;
  kind: DatasetKind;
  bbox: [number, number, number, number] | null;
  stats: Record<string, unknown>;
  storage_path: string | null;
  ingest_token: string;
  sample_count: number;
  units: string | null;
  world: string;
  created_at: string;
  updated_at: string;
}

/** Read the world id that the Atlas is currently showing. Defaults to earth. */
function activeWorld(): string {
  const raw = (typeof window !== "undefined" && (window as any).__atlasWorldId) || "earth";
  return String(raw).toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 40) || "earth";
}

const KIND_BY_EXT: Record<string, DatasetKind> = {
  geojson: "geojson", json: "json",
  kml: "kml", kmz: "kml",
  zip: "shp", shp: "shp",
  csv: "csv", tsv: "csv",
  tif: "geotiff", tiff: "geotiff",
  nc: "netcdf",
  gpx: "gpx",
  onnx: "model", pt: "model", pkl: "model", joblib: "model", pb: "model", h5: "model",
};

export function guessKind(filename: string): DatasetKind {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return KIND_BY_EXT[ext] ?? "json";
}

export async function listDatasets(): Promise<UserDataset[]> {
  const world = activeWorld();
  const { data, error } = await supabase
    .from("user_datasets")
    .select("*")
    .eq("world", world)
    .order("created_at", { ascending: false });
  if (error) { console.warn("[datasets] list", error); return []; }
  return (data ?? []) as unknown as UserDataset[];
}

export async function uploadDataset(file: File, name?: string): Promise<UserDataset | null> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Sign in to upload datasets");
  const kind = guessKind(file.name);
  const path = `${u.user.id}/${crypto.randomUUID()}-${file.name}`;
  const up = await supabase.storage.from("user-datasets").upload(path, file, { upsert: false });
  if (up.error) throw up.error;

  const { data, error } = await supabase.from("user_datasets").insert({
    owner_id: u.user.id,
    name: name || file.name,
    kind,
    storage_path: path,
    stats: { size: file.size, mime: file.type } as any,
    world: activeWorld(),
  }).select().single();
  if (error) throw error;

  // Kick off async conversion (fire-and-forget)
  supabase.functions.invoke("dataset-convert", { body: { dataset_id: (data as any).id } }).catch(() => {});
  return data as unknown as UserDataset;
}

export async function deleteDataset(d: UserDataset): Promise<void> {
  if (d.storage_path) await supabase.storage.from("user-datasets").remove([d.storage_path]);
  await supabase.from("user_datasets").delete().eq("id", d.id);
}

export async function rotateIngestToken(id: string): Promise<string | null> {
  const token = Array.from(crypto.getRandomValues(new Uint8Array(24))).map((b) => b.toString(16).padStart(2, "0")).join("");
  const { error } = await supabase.from("user_datasets").update({ ingest_token: token }).eq("id", id);
  if (error) { console.warn("[datasets] rotate", error); return null; }
  return token;
}