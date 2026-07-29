// Keyword normalisation, hazard matching, geocoding and reply localisation.

export const HAZARDS = [
  "earthquake",
  "tsunami",
  "flood",
  "wildfire",
  "volcano",
  "hurricane",
  "tornado",
  "storm",
  "landslide",
  "heat",
  "drought",
  "cold",
  "avalanche",
  "epidemic",
  "chemical",
  "nuclear",
  "conflict",
  "all",
] as const;
export type Hazard = (typeof HAZARDS)[number];

/** Lowercase, strip diacritics, drop leading #, collapse punctuation. */
export function normalize(token: string): string {
  return token
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/^[#＃]+/, "")
    .replace(/[^\p{L}\p{N}]/gu, "")
    .trim();
}

/** Pull every #hashtag out of a message body (supports full-width ＃). */
export function extractTags(body: string): string[] {
  const out: string[] = [];
  for (const m of body.matchAll(/[#＃]\s?([\p{L}\p{N}_-]{2,40})/gu)) {
    const n = normalize(m[1]);
    if (n) out.push(n);
  }
  return [...new Set(out)];
}

/** Tokenise the whole message so bare keywords (no #) also match. */
export function extractWords(body: string): string[] {
  return [
    ...new Set(
      body
        .split(/[\s,.;:!?/\\|()[\]{}"'«»„“”]+/u)
        .map(normalize)
        .filter((w) => w.length >= 2 && w.length <= 40),
    ),
  ];
}

export interface KeywordRow {
  hazard: string;
  lang: string;
  normalized: string;
}

export interface MatchResult {
  hazards: string[];
  language: string | null;
}

/**
 * Match hashtags first (explicit intent), then fall back to bare words.
 * Language is inferred from the language of the matched keywords.
 */
export function matchHazards(body: string, rows: KeywordRow[]): MatchResult {
  const index = new Map<string, KeywordRow[]>();
  for (const r of rows) {
    const list = index.get(r.normalized);
    if (list) list.push(r);
    else index.set(r.normalized, [r]);
  }

  const tally = (tokens: string[]) => {
    const hazards = new Set<string>();
    const langs = new Map<string, number>();
    for (const t of tokens) {
      for (const r of index.get(t) ?? []) {
        hazards.add(r.hazard);
        langs.set(r.lang, (langs.get(r.lang) ?? 0) + 1);
      }
    }
    let language: string | null = null;
    let best = 0;
    for (const [lang, n] of langs) {
      // Prefer a non-English match so "#terremoto" replies in Spanish.
      const weight = lang === "en" ? n - 0.5 : n;
      if (weight > best) {
        best = weight;
        language = lang;
      }
    }
    return { hazards: [...hazards], language };
  };

  const tagged = tally(extractTags(body));
  if (tagged.hazards.length) return tagged;
  return tally(extractWords(body));
}

export interface GeoPlace {
  city: string | null;
  region: string | null;
  country: string | null;
  country_code: string | null;
  lat: number;
  lon: number;
  display: string;
}

const NOMINATIM_UA = "AtlasMapping-HOT-Warnings/1.0 (sos.atlasmapping.org)";

/** Free-text place -> coordinates via OpenStreetMap Nominatim. */
export async function geocode(query: string, lang = "en"): Promise<GeoPlace | null> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "1");
  url.searchParams.set("accept-language", lang);

  const res = await fetch(url, { headers: { "User-Agent": NOMINATIM_UA } });
  if (!res.ok) {
    console.error(`Nominatim geocode failed [${res.status}]: ${await res.text()}`);
    return null;
  }
  const rows = await res.json();
  const hit = Array.isArray(rows) ? rows[0] : null;
  if (!hit) return null;

  const a = hit.address ?? {};
  return {
    city: a.city ?? a.town ?? a.village ?? a.municipality ?? a.county ?? null,
    region: a.state ?? a.region ?? null,
    country: a.country ?? null,
    country_code: (a.country_code ?? "").toUpperCase() || null,
    lat: Number(hit.lat),
    lon: Number(hit.lon),
    display: hit.display_name ?? query,
  };
}

/** Coordinates -> place name (used by the share-location link). */
export async function reverseGeocode(lat: number, lon: number, lang = "en"): Promise<GeoPlace | null> {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lon));
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("accept-language", lang);

  const res = await fetch(url, { headers: { "User-Agent": NOMINATIM_UA } });
  if (!res.ok) return null;
  const hit = await res.json();
  const a = hit?.address ?? {};
  return {
    city: a.city ?? a.town ?? a.village ?? a.municipality ?? a.county ?? null,
    region: a.state ?? a.region ?? null,
    country: a.country ?? null,
    country_code: (a.country_code ?? "").toUpperCase() || null,
    lat,
    lon,
    display: hit?.display_name ?? `${lat}, ${lon}`,
  };
}

/** Great-circle distance in km. */
export function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// --- Reply localisation -----------------------------------------------------

const translationCache = new Map<string, string>();

/**
 * Translate an outbound SMS into the subscriber's language via Lovable AI.
 * Falls back to the original English text on any failure — a warning must
 * never be dropped because translation was unavailable.
 */
export async function localize(text: string, lang: string): Promise<string> {
  if (!lang || lang === "en") return text;
  const key = `${lang}::${text}`;
  const cached = translationCache.get(key);
  if (cached) return cached;

  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return text;

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content:
              "You translate emergency SMS messages. Reply with ONLY the translation, no notes. " +
              "Keep it under 300 characters, keep URLs, numbers, hashtags and placeholders exactly as-is. " +
              "Use plain, urgent, unambiguous wording a stranger can act on immediately.",
          },
          { role: "user", content: `Translate to ${lang}:\n\n${text}` },
        ],
      }),
    });
    if (!res.ok) {
      console.error(`Translation failed [${res.status}]: ${await res.text()}`);
      return text;
    }
    const out = (await res.json())?.choices?.[0]?.message?.content?.trim();
    if (!out) return text;
    if (translationCache.size > 500) translationCache.clear();
    translationCache.set(key, out);
    return out;
  } catch (err) {
    console.error("Translation error:", err);
    return text;
  }
}