// Historical plate reads for the caller. Combines:
//   1. Local reads from lpr_plate_reads (fastest, always available).
//   2. Optional Rekor Cloud /v1/search/group query when the user is on
//      network access (admin or approved platform key), so route
//      reconstruction covers cameras the user does not own.

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY, resolveRekorKey, bumpUsage, serviceClient, toEpochMs } from "../_shared/lpr.ts";

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
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userId = userData.user.id;

  let body: { plate?: string; hours?: number; include_network?: boolean };
  try { body = await req.json(); } catch { body = {}; }
  const plate = (body.plate ?? "").toUpperCase().replace(/\s/g, "");
  if (!plate || plate.length < 2) {
    return new Response(JSON.stringify({ error: "plate_required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const hours = Math.min(Math.max(body.hours ?? 24, 1), 24 * 30);
  const sinceMs = Date.now() - hours * 3600 * 1000;

  const svc = serviceClient();
  const { data: local } = await svc
    .from("lpr_plate_reads")
    .select("id, plate, lat, lng, epoch_ms, camera_id, confidence, vehicle_make, vehicle_model, vehicle_color, image_url")
    .eq("user_id", userId)
    .gte("epoch_ms", sinceMs)
    .ilike("plate", `%${plate}%`)
    .order("epoch_ms", { ascending: true })
    .limit(2000);

  let networkReads: any[] = [];
  if (body.include_network) {
    try {
      const resolved = await resolveRekorKey(userId);
      if (resolved.source === "admin" || resolved.source === "platform") {
        const params = new URLSearchParams({
          secret_key: resolved.apiKey,
          plate,
          start: Math.floor(sinceMs / 1000).toString(),
          end: Math.floor(Date.now() / 1000).toString(),
          topn: "500",
        });
        const res = await fetch(`https://api.openalpr.com/v1/search/group?${params.toString()}`);
        if (res.ok) {
          const j = await res.json();
          await bumpUsage(userId, 1);
          networkReads = (j?.groups ?? []).map((g: any) => ({
            id: `net-${g.best_uuid ?? g.uuid ?? Math.random().toString(36).slice(2)}`,
            plate: g.best_plate?.plate ?? g.best_plate_number ?? plate,
            lat: g.gps_latitude ?? null,
            lng: g.gps_longitude ?? null,
            epoch_ms: toEpochMs(g.epoch_start ?? g.epoch_end ?? Date.now()),
            confidence: g.best_plate?.confidence ?? null,
            camera_id: null,
            source: "network",
          }));
        }
      }
    } catch (e) {
      console.warn("network history skipped:", (e as Error).message);
    }
  }

  const merged = [...(local ?? []).map((r) => ({ ...r, source: "local" as const })), ...networkReads]
    .sort((a, b) => a.epoch_ms - b.epoch_ms);

  return new Response(JSON.stringify({ plate, hours, reads: merged }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});