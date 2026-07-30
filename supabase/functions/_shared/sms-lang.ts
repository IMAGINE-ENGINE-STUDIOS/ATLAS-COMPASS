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
 * Script detection. Many hazard words are shared across languages that use the
 * same script ("terremoto" is Spanish *and* Portuguese, "地震" is Japanese *and*
 * Chinese), so the writing system is the strongest signal we have from a single
 * SMS. A script hit outranks keyword tallies.
 */
export function detectScript(body: string): string | null {
  if (/[\u3040-\u309f\u30a0-\u30ff]/u.test(body)) return "ja"; // hiragana / katakana
  if (/[\uac00-\ud7af\u1100-\u11ff]/u.test(body)) return "ko"; // hangul
  if (/[\u0e00-\u0e7f]/u.test(body)) return "th";
  if (/[\u0590-\u05ff]/u.test(body)) return "he";
  if (/[\u0980-\u09ff]/u.test(body)) return "bn";
  if (/[\u0900-\u097f]/u.test(body)) return "hi";
  if (/[\u0a80-\u0aff]/u.test(body)) return "gu";
  if (/[\u0b80-\u0bff]/u.test(body)) return "ta";
  if (/[\u0c00-\u0c7f]/u.test(body)) return "te";
  if (/[\u0d00-\u0d7f]/u.test(body)) return "ml";
  if (/[\u0f00-\u0fff]/u.test(body)) return "bo";
  if (/[\u1200-\u137f]/u.test(body)) return "am";
  if (/[\u10a0-\u10ff]/u.test(body)) return "ka";
  if (/[\u0530-\u058f]/u.test(body)) return "hy";
  if (/[\u0400-\u04ff]/u.test(body)) return "ru"; // Cyrillic default
  if (/[\u0370-\u03ff]/u.test(body)) return "el";
  if (/[\u0600-\u06ff\u0750-\u077f]/u.test(body)) return "ar"; // Arabic script default
  if (/[\u4e00-\u9fff]/u.test(body)) return "zh"; // Han without kana
  return null;
}

/**
 * Deterministic tie-break when several languages share the exact same keyword.
 * Without it the winner depends on database row order, so "#terremoto" could
 * answer in Portuguese one day and Spanish the next.
 */
const LANG_PRIORITY = [
  "es", "pt", "fr", "de", "it", "id", "tr", "vi", "pl", "nl", "ro", "sw", "tl", "en",
];
const priority = (lang: string) => {
  const i = LANG_PRIORITY.indexOf(lang);
  return i === -1 ? LANG_PRIORITY.length : i;
};

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

  const scriptLang = detectScript(body);

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
      // Prefer a non-English match so "#terremoto" replies in Spanish, and let
      // the detected script win outright when it is one of the candidates.
      let weight = lang === "en" ? n - 0.5 : n;
      if (scriptLang && lang === scriptLang) weight += 10;
      if (weight > best || (weight === best && language && priority(lang) < priority(language))) {
        best = weight;
        language = lang;
      }
    }
    // The script is unambiguous even when no keyword row for it matched.
    if (scriptLang && hazards.size && !langs.has(scriptLang)) language = scriptLang;
    return { hazards: [...hazards], language };
  };

  const tagged = tally(extractTags(body));
  if (tagged.hazards.length) return tagged;
  const worded = tally(extractWords(body));
  if (worded.hazards.length) return worded;

  // Japanese, Chinese and Thai are written without spaces, so "#地震です" never
  // tokenises into a keyword. Fall back to substring matching for those scripts.
  if (scriptLang && ["ja", "zh", "th", "bo"].includes(scriptLang)) {
    const hazards = new Set<string>();
    const langs = new Map<string, number>();
    for (const r of rows) {
      if (r.normalized.length >= 2 && body.includes(r.normalized)) {
        hazards.add(r.hazard);
        langs.set(r.lang, (langs.get(r.lang) ?? 0) + 1);
      }
    }
    if (hazards.size) return { hazards: [...hazards], language: scriptLang };
  }
  return worded;
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
 * Bare ISO codes are ambiguous to the model — "es" has come back as Portuguese.
 * Always name the language explicitly.
 */
const LANG_NAMES: Record<string, string> = {
  es: "Spanish", pt: "Portuguese", fr: "French", de: "German", it: "Italian",
  nl: "Dutch", ru: "Russian", uk: "Ukrainian", pl: "Polish", ro: "Romanian",
  tr: "Turkish", ar: "Arabic", fa: "Persian", he: "Hebrew", ur: "Urdu",
  hi: "Hindi", bn: "Bengali", ta: "Tamil", te: "Telugu", ml: "Malayalam",
  gu: "Gujarati", pa: "Punjabi", mr: "Marathi", ne: "Nepali", si: "Sinhala",
  th: "Thai", vi: "Vietnamese", id: "Indonesian", ms: "Malay", tl: "Filipino",
  ja: "Japanese", ko: "Korean", zh: "Simplified Chinese", "zh-tw": "Traditional Chinese",
  el: "Greek", sv: "Swedish", no: "Norwegian", da: "Danish", fi: "Finnish",
  cs: "Czech", sk: "Slovak", hu: "Hungarian", bg: "Bulgarian", sr: "Serbian",
  hr: "Croatian", sl: "Slovenian", sq: "Albanian", et: "Estonian", lv: "Latvian",
  lt: "Lithuanian", ka: "Georgian", hy: "Armenian", az: "Azerbaijani", kk: "Kazakh",
  uz: "Uzbek", ky: "Kyrgyz", tg: "Tajik", mn: "Mongolian", my: "Burmese",
  km: "Khmer", lo: "Lao", am: "Amharic", ti: "Tigrinya", so: "Somali",
  sw: "Swahili", ha: "Hausa", yo: "Yoruba", ig: "Igbo", zu: "Zulu",
  xh: "Xhosa", af: "Afrikaans", rw: "Kinyarwanda", mg: "Malagasy", ay: "Aymara",
  qu: "Quechua", gn: "Guarani", ht: "Haitian Creole", bo: "Tibetan", ps: "Pashto",
  ku: "Kurdish", sd: "Sindhi", or: "Odia", as: "Assamese", is: "Icelandic",
  ga: "Irish", cy: "Welsh", eu: "Basque", ca: "Catalan", gl: "Galician",
  mt: "Maltese", mk: "Macedonian", be: "Belarusian", bs: "Bosnian",
};
export const languageName = (code: string) => LANG_NAMES[code.toLowerCase()] ?? code;

/**
 * Translate an outbound SMS into the subscriber's language via the managed AI gateway.
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
          {
            role: "user",
            content: `Translate into ${languageName(lang)} (ISO code "${lang}"). ` +
              `Do not use any other language.\n\n${text}`,
          },
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