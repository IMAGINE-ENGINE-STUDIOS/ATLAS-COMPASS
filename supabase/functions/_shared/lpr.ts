// Shared helpers for LPR edge functions.
// Resolves which Rekor API key to use for a given user based on their
// access mode (admin, platform, byok) and returns a supabase client
// bound to the caller's JWT for RLS-aware reads.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
export const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
export const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export function serviceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

export function userClient(authHeader: string): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
}

export interface ResolvedKey {
  apiKey: string;
  source: "admin" | "platform" | "byok";
  settings: {
    user_id: string;
    access_mode: string;
    legal_ack_at: string | null;
    platform_approved: boolean;
    byok_api_key: string | null;
    daily_request_cap: number;
    requests_today: number;
    requests_reset_at: string;
  };
  isAdmin: boolean;
}

export async function resolveRekorKey(userId: string): Promise<ResolvedKey> {
  const svc = serviceClient();
  const { data: roleRow } = await svc
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "atlas_admin")
    .maybeSingle();
  const isAdmin = !!roleRow;

  let { data: settings } = await svc
    .from("lpr_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (!settings) {
    const inserted = await svc
      .from("lpr_settings")
      .insert({ user_id: userId, access_mode: isAdmin ? "admin" : "byok" })
      .select("*")
      .single();
    settings = inserted.data!;
  }

  if (!settings.legal_ack_at) {
    throw new Error("legal_ack_required");
  }

  // Reset daily counter if the day has rolled over.
  const today = new Date().toISOString().slice(0, 10);
  if (settings.requests_reset_at !== today) {
    await svc
      .from("lpr_settings")
      .update({ requests_today: 0, requests_reset_at: today })
      .eq("user_id", userId);
    settings.requests_today = 0;
    settings.requests_reset_at = today;
  }
  if (settings.requests_today >= settings.daily_request_cap) {
    throw new Error("daily_cap_exceeded");
  }

  const ADMIN_KEY = Deno.env.get("REKOR_ADMIN_API_KEY") ?? "";
  const PLATFORM_KEY = Deno.env.get("REKOR_PLATFORM_API_KEY") ?? "";

  if (isAdmin && settings.access_mode === "admin") {
    if (!ADMIN_KEY) throw new Error("admin_key_not_configured");
    return { apiKey: ADMIN_KEY, source: "admin", settings, isAdmin };
  }
  if (settings.access_mode === "platform") {
    if (!settings.platform_approved) throw new Error("platform_access_not_approved");
    if (!PLATFORM_KEY) throw new Error("platform_key_not_configured");
    return { apiKey: PLATFORM_KEY, source: "platform", settings, isAdmin };
  }
  // byok
  if (!settings.byok_api_key) throw new Error("byok_key_missing");
  return { apiKey: settings.byok_api_key, source: "byok", settings, isAdmin };
}

export async function bumpUsage(userId: string, delta = 1) {
  const svc = serviceClient();
  const { data } = await svc
    .from("lpr_settings")
    .select("requests_today")
    .eq("user_id", userId)
    .single();
  const current = data?.requests_today ?? 0;
  await svc
    .from("lpr_settings")
    .update({ requests_today: current + delta })
    .eq("user_id", userId);
}

export function toEpochMs(v: unknown): number {
  if (typeof v === "number") return v > 1e12 ? v : v * 1000;
  if (typeof v === "string") {
    const n = Number(v);
    if (!Number.isNaN(n)) return n > 1e12 ? n : n * 1000;
    const d = Date.parse(v);
    if (!Number.isNaN(d)) return d;
  }
  return Date.now();
}

export async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const c = s1 * s1 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * s2 * s2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(c)));
}

// Extracts an array of [lng, lat] pairs from any of the common polygon
// shapes we store in geofences.polygon: GeoJSON Feature, GeoJSON Polygon,
// or a raw ring.
export function extractRing(polygon: unknown): Array<[number, number]> | null {
  if (!polygon || typeof polygon !== "object") return null;
  const p = polygon as any;
  const candidates: any[] = [
    p?.geometry?.coordinates?.[0],
    p?.coordinates?.[0],
    p?.ring,
    Array.isArray(p) ? p : null,
  ];
  for (const c of candidates) {
    if (Array.isArray(c) && c.length >= 3 && Array.isArray(c[0]) && c[0].length >= 2) {
      return c.map((pt: any) => [Number(pt[0]), Number(pt[1])] as [number, number])
        .filter((pt) => Number.isFinite(pt[0]) && Number.isFinite(pt[1]));
    }
  }
  return null;
}

export function pointInRing(lat: number, lng: number, ring: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = ((yi > lat) !== (yj > lat)) &&
      (lng < ((xj - xi) * (lat - yi)) / ((yj - yi) || 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}