// Public webhook endpoint that Rekor Scout agents post plate_group events
// to. The user pastes their per-account webhook URL (this function's URL +
// ?u=<user_id>) into their Rekor account. We verify the shared secret from
// the user's lpr_settings.webhook_secret via HMAC-SHA256 of the raw body.

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { serviceClient, toEpochMs, hmacSha256Hex, extractRing, pointInRing } from "../_shared/lpr.ts";

function topBest(list?: Array<{ name: string; confidence: number }>): string | null {
  return list && list.length ? list[0].name : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const userId = url.searchParams.get("u");
  if (!userId) {
    return new Response(JSON.stringify({ error: "missing_user" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const raw = await req.text();
  const svc = serviceClient();
  const { data: settings } = await svc
    .from("lpr_settings")
    .select("webhook_secret, legal_ack_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (!settings || !settings.legal_ack_at) {
    return new Response(JSON.stringify({ error: "user_not_ready" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const sig = req.headers.get("x-openalpr-signature") ?? req.headers.get("x-signature") ?? "";
  if (settings.webhook_secret) {
    const expected = await hmacSha256Hex(settings.webhook_secret, raw);
    // Rekor sends hex; accept either raw hex or a "sha256=" prefix.
    const provided = sig.replace(/^sha256=/, "").trim();
    if (!provided || provided.toLowerCase() !== expected.toLowerCase()) {
      return new Response(JSON.stringify({ error: "bad_signature" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  let payload: any;
  try { payload = JSON.parse(raw); }
  catch {
    return new Response(JSON.stringify({ error: "bad_json" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const dataType = payload?.data_type ?? payload?.type;

  // Heartbeat: just update the camera row.
  if (dataType === "heartbeat" && payload?.agent_uid) {
    const agentUid = String(payload.agent_uid);
    const lat = payload?.gps_latitude ?? null;
    const lng = payload?.gps_longitude ?? null;
    const label = payload?.site_name ?? `Agent ${agentUid.slice(0, 8)}`;
    await svc.from("lpr_cameras").upsert({
      user_id: userId,
      agent_uid: agentUid,
      kind: "network",
      label,
      lat, lng,
      active: true,
      last_seen_at: new Date().toISOString(),
    }, { onConflict: "user_id,agent_uid" });
    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // plate_group: the interesting one — a confirmed plate + best candidate list.
  if (dataType === "alpr_group" || dataType === "plate_group") {
    const bestPlate = payload?.best_plate ?? payload?.plate ?? {};
    const plate = bestPlate?.plate ?? payload?.best_plate_number;
    if (!plate) {
      return new Response(JSON.stringify({ ok: true, skipped: "no_plate" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const agentUid = payload?.agent_uid ? String(payload.agent_uid) : null;
    const lat = payload?.gps_latitude ?? null;
    const lng = payload?.gps_longitude ?? null;

    let cameraId: string | null = null;
    if (agentUid) {
      const camUpsert = await svc.from("lpr_cameras").upsert({
        user_id: userId,
        agent_uid: agentUid,
        kind: "network",
        label: payload?.site_name ?? `Agent ${agentUid.slice(0, 8)}`,
        lat, lng,
        active: true,
        last_seen_at: new Date().toISOString(),
      }, { onConflict: "user_id,agent_uid" }).select("id").maybeSingle();
      cameraId = camUpsert.data?.id ?? null;
    }

    const vehicle = payload?.vehicle ?? {};
    const row = {
      user_id: userId,
      camera_id: cameraId,
      plate,
      confidence: bestPlate?.confidence ?? payload?.confidence ?? null,
      region: bestPlate?.region ?? payload?.region ?? null,
      lat, lng,
      epoch_ms: toEpochMs(payload?.epoch_start ?? payload?.epoch_end ?? Date.now()),
      vehicle_make: topBest(vehicle?.make),
      vehicle_model: topBest(vehicle?.model),
      vehicle_color: topBest(vehicle?.color),
      vehicle_year: topBest(vehicle?.year),
      vehicle_body: topBest(vehicle?.body_type),
      image_url: payload?.web_image ?? payload?.web_image_high_quality ?? null,
      raw: payload,
    };
    const { data: inserted } = await svc.from("lpr_plate_reads").insert(row).select("id, plate, lat, lng").single();

    if (inserted && typeof lat === "number" && typeof lng === "number") {
      const { data: fences } = await svc
        .from("geofences")
        .select("id, polygon")
        .eq("owner_id", userId)
        .eq("lpr_alert", true);
      const { data: watch } = await svc
        .from("lpr_watchlist")
        .select("plate")
        .eq("user_id", userId);
      const watched = (watch ?? []).some((w) => (w.plate as string).toUpperCase().replace(/\s/g, "") === String(plate).toUpperCase().replace(/\s/g, ""));

      const hits: Array<{ user_id: string; geofence_id: string | null; read_id: string; plate: string }> = [];
      for (const f of fences ?? []) {
        const ring = extractRing((f as any).polygon);
        if (ring && pointInRing(lat, lng, ring)) {
          hits.push({ user_id: userId, geofence_id: f.id, read_id: inserted.id, plate });
        }
      }
      if (watched && !hits.length) {
        hits.push({ user_id: userId, geofence_id: null, read_id: inserted.id, plate });
      }
      if (hits.length) await svc.from("lpr_geofence_hits").insert(hits);
    }

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Unknown event type — accept + no-op so Rekor doesn't retry indefinitely.
  return new Response(JSON.stringify({ ok: true, ignored: dataType ?? "unknown" }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});