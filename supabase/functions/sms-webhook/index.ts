// Inbound Twilio webhook: hashtag subscriptions, location capture, username creation.
import { createClient } from "npm:@supabase/supabase-js@2";
import { twiml, verifySignature } from "../_shared/twilio.ts";
import { geocode, localize, matchHazards, normalize } from "../_shared/sms-lang.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PUBLIC_ORIGIN = Deno.env.get("PUBLIC_SITE_ORIGIN") ?? "https://sos.atlasmapping.org";

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const STOP_WORDS = new Set([
  "stop", "stopall", "unsubscribe", "cancel", "end", "quit", "baja", "alto", "parar",
  "arret", "stopp", "pare", "tebligi", "detener",
]);
const HELP_WORDS = new Set(["help", "info", "ayuda", "aide", "hilfe", "ajuda", "aiuto", "yardim"]);
const LOCATION_WORDS = new Set(["loc", "location", "gps", "ubicacion", "localisation", "standort"]);
const STATUS_WORDS = new Set(["status", "me", "estado", "statut"]);

function firstWord(body: string): string {
  return normalize((body.trim().split(/\s+/)[0] ?? ""));
}

function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 12);
}

/** Deterministic, non-identifying handle: cc-city-#### (last 4 of the phone). */
async function makeUsername(phone: string, cc: string | null, city: string | null): Promise<string> {
  const tail = phone.replace(/\D/g, "").slice(-4);
  const base = [slug(cc ?? "xx") || "xx", slug(city ?? "") || "area", tail].filter(Boolean).join("-");
  for (let i = 0; i < 12; i++) {
    const candidate = i === 0 ? base : `${base}${i}`;
    const { data } = await admin
      .from("sms_subscribers")
      .select("id")
      .eq("username", candidate)
      .maybeSingle();
    if (!data) return candidate;
  }
  return `${base}-${crypto.randomUUID().slice(0, 4)}`;
}

async function locationLink(phone: string): Promise<string> {
  const token = crypto.randomUUID().replace(/-/g, "").slice(0, 22);
  await admin.from("sms_location_tokens").insert({
    token,
    phone_e164: phone,
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  });
  return `${PUBLIC_ORIGIN}/loc/${token}`;
}

function hazardList(h: string[]): string {
  return h.includes("all") ? "ALL hazards" : h.join(", ");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const raw = await req.text();
  const params: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(raw)) params[k] = v;

  // Twilio signs against the exact public URL it was configured with.
  const url = `${SUPABASE_URL}/functions/v1/sms-webhook`;
  const valid = await verifySignature(req.headers.get("x-twilio-signature"), url, params);
  if (!valid) {
    console.error("Rejected inbound message: invalid Twilio signature");
    return new Response("Forbidden", { status: 403 });
  }

  const from = (params.From ?? "").replace(/^whatsapp:/, "").trim();
  const channel = (params.From ?? "").startsWith("whatsapp:") ? "whatsapp" : "sms";
  const body = (params.Body ?? "").trim();
  const sid = params.MessageSid ?? params.SmsMessageSid ?? null;
  if (!from) return twiml();

  // Carriers retry; never process the same message twice.
  if (sid) {
    const { data: seen } = await admin
      .from("sms_inbox")
      .select("id, reply_sent")
      .eq("message_sid", sid)
      .maybeSingle();
    if (seen) return twiml(seen.reply_sent ?? undefined);
  }

  const { data: existing } = await admin
    .from("sms_subscribers")
    .select("*")
    .eq("phone_e164", from)
    .maybeSingle();

  const { data: keywords } = await admin
    .from("hazard_keywords")
    // The dictionary is larger than PostgREST's default 1000-row page; without
    // an explicit range, later languages silently drop out of matching.
    .select("hazard, lang, normalized")
    .range(0, 19999);

  const match = matchHazards(body, keywords ?? []);
  let lang = match.language ?? existing?.language ?? "en";
  const cmd = firstWord(body);

  let reply = "";
  let matchedHazards: string[] = match.hazards;

  if (STOP_WORDS.has(cmd)) {
    if (existing) {
      await admin
        .from("sms_subscribers")
        .update({ state: "stopped", stopped_at: new Date().toISOString() })
        .eq("id", existing.id);
    }
    reply = "You are unsubscribed from HOT warnings. No more messages will be sent. Text a hazard tag like #earthquake to rejoin.";
  } else if (HELP_WORDS.has(cmd)) {
    reply =
      `HOT emergency warnings. Text a hazard tag to subscribe: #earthquake #flood #wildfire #hurricane #tsunami #volcano #storm #heat — in any language. ` +
      `Text LOC to update your location, STATUS to see your settings, STOP to quit. Full list: ${PUBLIC_ORIGIN}/keywords`;
  } else if (LOCATION_WORDS.has(cmd)) {
    const link = await locationLink(from);
    reply = `Share your exact location (one tap, nothing installed): ${link}\nOr just text your city and country, e.g. "Lima, Peru".`;
  } else if (STATUS_WORDS.has(cmd) && existing) {
    reply = existing.lat != null
      ? `HOT: @${existing.username}. Watching ${hazardList(existing.hazards)} within ${existing.radius_km}km of ${existing.city ?? "your area"}, ${existing.country ?? ""}. Text LOC to move, STOP to quit.`
      : `HOT: we still need your location. Text your city and country, or tap ${await locationLink(from)}`;
  } else if (existing && existing.state === "awaiting_location" && !matchedHazards.length) {
    // Any free text while awaiting location is treated as a place name.
    const place = await geocode(body, lang);
    if (!place) {
      const link = await locationLink(from);
      reply = `We could not find "${body}". Try "City, Country" (e.g. "Osaka, Japan") or tap ${link} to share your exact location.`;
    } else {
      const hazards = existing.pending_hazards?.length ? existing.pending_hazards : existing.hazards;
      const username =
        existing.username ?? (await makeUsername(from, place.country_code, place.city));
      await admin
        .from("sms_subscribers")
        .update({
          username,
          hazards,
          pending_hazards: [],
          city: place.city,
          region: place.region,
          country: place.country,
          country_code: place.country_code,
          lat: place.lat,
          lon: place.lon,
          precise_location: false,
          state: "active",
          language: lang,
          consent_at: existing.consent_at ?? new Date().toISOString(),
        })
        .eq("id", existing.id);
      reply =
        `You are set. @${username} — watching ${hazardList(hazards)} within ${existing.radius_km}km of ${place.city ?? place.display}. ` +
        `We will text you warnings and official instructions from local authorities. Text LOC for exact GPS, STOP to quit.`;
    }
  } else if (matchedHazards.length) {
    const merged = existing
      ? [...new Set([...(existing.hazards ?? []), ...matchedHazards])]
      : matchedHazards;
    const hasLocation = existing?.lat != null;

    if (!existing) {
      await admin.from("sms_subscribers").insert({
        phone_e164: from,
        language: lang,
        hazards: [],
        pending_hazards: merged,
        state: "awaiting_location",
        consent_at: new Date().toISOString(),
        last_inbound_at: new Date().toISOString(),
      });
    } else {
      await admin
        .from("sms_subscribers")
        .update({
          language: lang,
          hazards: hasLocation ? merged : existing.hazards,
          pending_hazards: hasLocation ? [] : merged,
          state: hasLocation ? "active" : "awaiting_location",
          stopped_at: null,
          last_inbound_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    }

    if (hasLocation) {
      reply = `Subscribed to ${hazardList(merged)} near ${existing!.city ?? "your area"}. You will get warnings plus official instructions. Text LOC to change location, STOP to quit.`;
    } else {
      const link = await locationLink(from);
      reply =
        `You asked for ${hazardList(merged)} warnings. We need your location to warn only you when it matters.\n` +
        `Reply with your city and country (e.g. "Quito, Ecuador"), or tap for exact GPS: ${link}`;
    }
  } else {
    lang = existing?.language ?? "en";
    reply =
      `We did not recognise that. Text a hazard tag in any language — #earthquake #terremoto #地震 #زلزال #flood #wildfire #hurricane. ` +
      `Full list: ${PUBLIC_ORIGIN}/keywords · HELP for commands · STOP to quit.`;
  }

  const localized = await localize(reply, lang);

  await admin.from("sms_inbox").insert({
    message_sid: sid,
    from_phone: from,
    to_phone: params.To ?? null,
    body,
    channel,
    detected_language: lang,
    matched_hazards: matchedHazards,
    reply_sent: localized,
  });

  return twiml(localized);
});