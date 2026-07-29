// Public endpoint backing the one-tap "share my exact location" SMS link.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { localize, reverseGeocode } from "../_shared/sms-lang.ts";
import { sendMessage } from "../_shared/twilio.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function slug(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "").slice(0, 12);
}

async function makeUsername(phone: string, cc: string | null, city: string | null): Promise<string> {
  const tail = phone.replace(/\D/g, "").slice(-4);
  const base = [slug(cc ?? "xx") || "xx", slug(city ?? "") || "area", tail].join("-");
  for (let i = 0; i < 12; i++) {
    const candidate = i === 0 ? base : `${base}${i}`;
    const { data } = await admin.from("sms_subscribers").select("id").eq("username", candidate).maybeSingle();
    if (!data) return candidate;
  }
  return `${base}-${crypto.randomUUID().slice(0, 4)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { token, lat, lon, accuracy } = await req.json().catch(() => ({}));

    if (typeof token !== "string" || token.length < 8 || token.length > 64) {
      return json({ error: "Invalid link" }, 400);
    }
    if (typeof lat !== "number" || typeof lon !== "number" ||
        lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return json({ error: "Invalid coordinates" }, 400);
    }

    const { data: row } = await admin
      .from("sms_location_tokens")
      .select("*")
      .eq("token", token)
      .maybeSingle();

    if (!row) return json({ error: "This link is not valid." }, 404);
    if (row.used_at) return json({ error: "This link was already used. Text LOC for a fresh one." }, 410);
    if (new Date(row.expires_at) < new Date()) {
      return json({ error: "This link expired. Text LOC for a fresh one." }, 410);
    }

    const { data: sub } = await admin
      .from("sms_subscribers")
      .select("*")
      .eq("phone_e164", row.phone_e164)
      .maybeSingle();
    if (!sub) return json({ error: "No subscription found for this number." }, 404);

    const lang = sub.language ?? "en";
    const place = await reverseGeocode(lat, lon, lang);
    const hazards = sub.pending_hazards?.length ? sub.pending_hazards : sub.hazards;
    const username = sub.username ?? (await makeUsername(row.phone_e164, place?.country_code ?? null, place?.city ?? null));

    await admin
      .from("sms_subscribers")
      .update({
        username,
        hazards,
        pending_hazards: [],
        lat,
        lon,
        precise_location: true,
        city: place?.city ?? sub.city,
        region: place?.region ?? sub.region,
        country: place?.country ?? sub.country,
        country_code: place?.country_code ?? sub.country_code,
        state: "active",
        consent_at: sub.consent_at ?? new Date().toISOString(),
      })
      .eq("id", sub.id);

    await admin
      .from("sms_location_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("token", token);

    const where = place?.city ?? `${lat.toFixed(3)}, ${lon.toFixed(3)}`;
    const confirm = await localize(
      `Exact location saved. @${username} — watching ${hazards.includes("all") ? "ALL hazards" : hazards.join(", ")} around ${where}. Text STOP to quit.`,
      lang,
    );
    const sent = await sendMessage(row.phone_e164, confirm);
    if (!sent.ok) console.error("Confirmation SMS failed:", sent.error);

    return json({
      ok: true,
      username,
      place: where,
      accuracy_m: typeof accuracy === "number" ? Math.round(accuracy) : null,
      hazards,
    });
  } catch (err) {
    console.error("sms-location error:", err);
    return json({ error: "Could not save your location. Please try again." }, 500);
  }
});