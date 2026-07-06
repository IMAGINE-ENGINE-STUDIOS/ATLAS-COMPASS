/**
 * CRUD helpers for the `geofences` table.
 * Backing store is Lovable Cloud; falls back to localStorage for signed-out
 * users so the tool is usable immediately without authentication.
 */
import { supabase } from "@/integrations/supabase/client";
import type { LngLat, TileId } from "@/components/atlas/geofence/tileMath";

export interface Geofence {
  id: string;
  owner_id: string | null;
  name: string;
  color: string;
  zoom: number;
  tile_set: TileId[];
  polygon: LngLat[] | null;
  created_at: string;
  updated_at: string;
}

const LOCAL_KEY = "atlas.geofences.local.v1";

function readLocal(): Geofence[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function writeLocal(list: Geofence[]) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(list)); } catch { /* noop */ }
}

async function currentUser(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export async function listGeofences(): Promise<Geofence[]> {
  const uid = await currentUser();
  if (!uid) return readLocal();
  const { data, error } = await supabase
    .from("geofences")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("[geofences] list failed, falling back to local", error);
    return readLocal();
  }
  return (data ?? []) as unknown as Geofence[];
}

export interface GeofenceInput {
  name: string;
  color: string;
  zoom: number;
  tile_set: TileId[];
  polygon: LngLat[] | null;
}

export async function createGeofence(input: GeofenceInput): Promise<Geofence> {
  const uid = await currentUser();
  if (!uid) {
    const now = new Date().toISOString();
    const g: Geofence = {
      id: crypto.randomUUID(),
      owner_id: null,
      created_at: now,
      updated_at: now,
      ...input,
    };
    writeLocal([g, ...readLocal()]);
    return g;
  }
  const { data, error } = await supabase
    .from("geofences")
    .insert({ ...input, owner_id: uid })
    .select()
    .single();
  if (error) throw error;
  return data as unknown as Geofence;
}

export async function updateGeofence(id: string, patch: Partial<GeofenceInput>): Promise<void> {
  const uid = await currentUser();
  if (!uid) {
    const list = readLocal().map((g) => g.id === id ? { ...g, ...patch, updated_at: new Date().toISOString() } : g);
    writeLocal(list);
    return;
  }
  const { error } = await supabase.from("geofences").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteGeofence(id: string): Promise<void> {
  const uid = await currentUser();
  if (!uid) {
    writeLocal(readLocal().filter((g) => g.id !== id));
    return;
  }
  const { error } = await supabase.from("geofences").delete().eq("id", id);
  if (error) throw error;
}