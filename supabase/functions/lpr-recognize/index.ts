// Proxies image bytes (base64) to Rekor's /v3/recognize_bytes endpoint,
// stores each candidate plate as a row in lpr_plate_reads, and returns
// the raw Rekor response for the client to render.

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  SUPABASE_URL, SUPABASE_ANON_KEY,
  resolveRekorKey, bumpUsage, serviceClient, toEpochMs, haversineKm,
} from "../_shared/lpr.ts";

interface RekorPlate {
  plate: string;
  confidence: number;
  region?: string;
  vehicle?: {
    make?: Array<{ name: string; confidence: number }>;
    model?: Array<{ name: string; confidence: number }>;
    color?: Array<{ name: string; confidence: number }>;
    year?: Array<{ name: string; confidence: number }>;
    body_type?: Array<{ name: string; confidence: number }>;
  };
}

function topName(list?: Array<{ name: string; confidence: number }>): string | null {
  if (!list || list.length === 0) return null;
  return list[0].name ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userId = userData.user.id;

  let body: {
    image_base64?: string;
    camera_id?: string;
    lat?: number;
    lng?: number;
    country?: string;
  };
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "bad_json" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!body.image_base64 || typeof body.image_base64 !== "string" || body.image_base64.length > 15_000_000) {
    return new Response(JSON.stringify({ error: "image_base64 required (<=15MB)" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let resolved;
  try { resolved = await resolveRekorKey(userId); }
  catch (e) {
    const msg = e instanceof Error ? e.message : "resolve_failed";
    return new Response(JSON.stringify({ error: msg }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const country = (body.country ?? "us").replace(/[^a-z]/gi, "").slice(0, 4) || "us";
  const url = `https://api.openalpr.com/v3/recognize_bytes?country=${encodeURIComponent(country)}&recognize_vehicle=1&topn=3&secret_key=${encodeURIComponent(resolved.apiKey)}`;

  const cleanBase64 = body.image_base64.replace(/^data:[^;]+;base64,/, "");
  const rekorRes = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: cleanBase64,
  });

  if (!rekorRes.ok) {
    const text = await rekorRes.text();
    console.error("rekor error", rekorRes.status, text);
    return new Response(JSON.stringify({ error: "rekor_failed", status: rekorRes.status, details: text }), {
      status: rekorRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const rekor = await rekorRes.json();
  await bumpUsage(userId, 1);

  const svc = serviceClient();
  const plates: RekorPlate[] = (rekor?.results ?? []).map((r: any) => ({
    plate: r.plate,
    confidence: r.confidence,
    region: r.region,
    vehicle: r.vehicle,
  }));

  const rows = plates.map((p) => ({
    user_id: userId,
    camera_id: body.camera_id ?? null,
    plate: p.plate,
    confidence: p.confidence,
    region: p.region ?? null,
    lat: body.lat ?? null,
    lng: body.lng ?? null,
    epoch_ms: toEpochMs(rekor?.epoch_time ?? Date.now()),
    vehicle_make: topName(p.vehicle?.make),
    vehicle_model: topName(p.vehicle?.model),
    vehicle_color: topName(p.vehicle?.color),
    vehicle_year: topName(p.vehicle?.year),
    vehicle_body: topName(p.vehicle?.body_type),
    image_url: null,
    raw: p as unknown as Record<string, unknown>,
  }));

  let insertedReads: any[] = [];
  if (rows.length) {
    const { data } = await svc.from("lpr_plate_reads").insert(rows).select("id, plate, lat, lng");
    insertedReads = data ?? [];
  }

  // Check geofence hits and watchlist matches for any read with coordinates.
  if (insertedReads.length && body.lat != null && body.lng != null) {
    const { data: fences } = await svc
      .from("geofences")
      .select("id, center_lat, center_lng, radius_m")
      .eq("user_id", userId)
      .eq("lpr_alert", true);
    const { data: watch } = await svc
      .from("lpr_watchlist")
      .select("plate")
      .eq("user_id", userId);
    const watchSet = new Set((watch ?? []).map((w) => (w.plate as string).toUpperCase().replace(/\s/g, "")));

    const hits: Array<{ user_id: string; geofence_id: string | null; read_id: string; plate: string }> = [];
    for (const r of insertedReads) {
      const norm = String(r.plate).toUpperCase().replace(/\s/g, "");
      const watched = watchSet.has(norm);
      for (const f of fences ?? []) {
        if (typeof (f as any).center_lat !== "number" || typeof (f as any).center_lng !== "number") continue;
        const dKm = haversineKm({ lat: r.lat, lng: r.lng }, { lat: (f as any).center_lat, lng: (f as any).center_lng });
        if (dKm * 1000 <= ((f as any).radius_m ?? 0)) {
          hits.push({ user_id: userId, geofence_id: f.id, read_id: r.id, plate: r.plate });
        }
      }
      if (watched && hits.every((h) => h.read_id !== r.id)) {
        hits.push({ user_id: userId, geofence_id: null, read_id: r.id, plate: r.plate });
      }
    }
    if (hits.length) await svc.from("lpr_geofence_hits").insert(hits);
  }

  return new Response(JSON.stringify({
    source: resolved.source,
    processing_time_ms: rekor?.processing_time?.total,
    plates,
    reads: insertedReads,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});