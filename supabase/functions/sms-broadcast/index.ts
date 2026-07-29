// Outbound warning dispatcher: matches subscribers by hazard + radius and texts them.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { haversineKm, localize } from "../_shared/sms-lang.ts";
import { sendMessage, twilioConfigured } from "../_shared/twilio.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PUBLIC_ORIGIN = Deno.env.get("PUBLIC_SITE_ORIGIN") ?? "https://sos.atlasmapping.org";

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Severity >= 4 may auto-broadcast; anything lower needs an admin. */
const AUTO_SEVERITY_FLOOR = 4;

interface EventInput {
  event_id?: string;
  hazard_type: string;
  severity: number;
  title: string;
  summary?: string;
  magnitude?: number;
  lat?: number;
  lon?: number;
  radius_km?: number;
  url?: string;
  instructions?: string;
  auto?: boolean;
  dry_run?: boolean;
}

function validate(input: Partial<EventInput>): string | null {
  if (!input || typeof input !== "object") return "Missing body";
  if (typeof input.hazard_type !== "string" || !input.hazard_type.trim()) return "hazard_type is required";
  if (typeof input.title !== "string" || !input.title.trim()) return "title is required";
  if (input.title.length > 300) return "title is too long";
  const sev = Number(input.severity);
  if (!Number.isFinite(sev) || sev < 1 || sev > 5) return "severity must be 1-5";
  if (input.lat != null && (typeof input.lat !== "number" || input.lat < -90 || input.lat > 90)) return "invalid lat";
  if (input.lon != null && (typeof input.lon !== "number" || input.lon < -180 || input.lon > 180)) return "invalid lon";
  return null;
}

async function isAdmin(req: Request): Promise<boolean> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;
  const token = authHeader.slice(7);
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return false;
  const { data: role } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id)
    .eq("role", "atlas_admin")
    .maybeSingle();
  return Boolean(role);
}

function buildMessage(e: EventInput, distanceKm: number | null): string {
  const sevLabel = ["", "ADVISORY", "WATCH", "WARNING", "SEVERE WARNING", "EXTREME EMERGENCY"][e.severity] ?? "WARNING";
  const parts = [`⚠️ ${sevLabel}: ${e.title}`];
  if (e.magnitude != null) parts.push(`Magnitude ${e.magnitude}`);
  if (distanceKm != null) parts.push(`~${Math.round(distanceKm)}km from you`);
  if (e.instructions) parts.push(`OFFICIAL INSTRUCTIONS: ${e.instructions}`);
  if (e.summary && !e.instructions) parts.push(e.summary.slice(0, 240));
  parts.push(e.url ? `Details: ${e.url}` : `Details: ${PUBLIC_ORIGIN}/hot`);
  parts.push("Reply STOP to unsubscribe.");
  return parts.join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    if (!twilioConfigured()) {
      return json({ error: "Twilio is not configured for this project" }, 503);
    }

    const input = (await req.json().catch(() => ({}))) as EventInput;
    const invalid = validate(input);
    if (invalid) return json({ error: invalid }, 400);

    // Automated calls only fire for severe events; everything else needs an admin.
    const auto = input.auto === true;
    if (!auto && !(await isAdmin(req))) {
      return json({ error: "Admin authentication required to broadcast" }, 403);
    }
    if (auto && input.severity < AUTO_SEVERITY_FLOOR) {
      return json({ skipped: true, reason: `severity ${input.severity} below auto floor ${AUTO_SEVERITY_FLOOR}` });
    }

    const radiusOverride = typeof input.radius_km === "number" ? input.radius_km : null;

    const { data: subs, error } = await admin
      .from("sms_subscribers")
      .select("id, phone_e164, language, hazards, lat, lon, radius_km, min_severity, city")
      .eq("state", "active");
    if (error) throw error;

    const targets = (subs ?? []).filter((s) => {
      if (input.severity < (s.min_severity ?? 3)) return false;
      const hazards: string[] = s.hazards ?? [];
      if (!hazards.includes("all") && !hazards.includes(input.hazard_type)) return false;
      if (input.lat == null || input.lon == null || s.lat == null || s.lon == null) return true;
      const d = haversineKm(input.lat, input.lon, s.lat, s.lon);
      return d <= (radiusOverride ?? s.radius_km ?? 300);
    });

    if (input.dry_run) {
      return json({ dry_run: true, matched: targets.length });
    }

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const s of targets) {
      // The unique (to_phone, event_id) index makes re-runs idempotent.
      if (input.event_id) {
        const { data: already } = await admin
          .from("sms_outbox")
          .select("id")
          .eq("to_phone", s.phone_e164)
          .eq("event_id", input.event_id)
          .maybeSingle();
        if (already) { skipped++; continue; }
      }

      const distance =
        input.lat != null && input.lon != null && s.lat != null && s.lon != null
          ? haversineKm(input.lat, input.lon, s.lat, s.lon)
          : null;

      const text = await localize(buildMessage(input, distance), s.language ?? "en");
      const result = await sendMessage(s.phone_e164, text);

      await admin.from("sms_outbox").insert({
        to_phone: s.phone_e164,
        body: text,
        event_id: input.event_id ?? null,
        hazard_type: input.hazard_type,
        severity: input.severity,
        message_sid: result.sid ?? null,
        status: result.ok ? "sent" : "failed",
        error: result.error ?? null,
      });

      if (result.ok) {
        sent++;
        await admin
          .from("sms_subscribers")
          .update({ last_outbound_at: new Date().toISOString() })
          .eq("id", s.id);
      } else {
        failed++;
      }
    }

    return json({ ok: true, matched: targets.length, sent, failed, skipped });
  } catch (err) {
    console.error("sms-broadcast error:", err);
    return json({ error: "Broadcast failed", details: String(err) }, 500);
  }
});