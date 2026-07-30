// Shared billing / pricing primitives for the ATLAS Signal developer API.
// Nothing in here may leak the name of the upstream carrier network.

/** Longest-prefix E.164 dialing-code → ISO country map for priced destinations. */
const DIAL_CODES: Array<[string, string]> = [
  ["1242", "BS"], ["1246", "BB"], ["1809", "DO"], ["1829", "DO"], ["1849", "DO"],
  ["20", "EG"], ["212", "MA"], ["213", "DZ"], ["216", "TN"], ["218", "LY"],
  ["220", "GM"], ["221", "SN"], ["233", "GH"], ["234", "NG"], ["254", "KE"],
  ["255", "TZ"], ["256", "UG"], ["27", "ZA"], ["30", "GR"], ["31", "NL"],
  ["32", "BE"], ["33", "FR"], ["34", "ES"], ["351", "PT"], ["352", "LU"],
  ["353", "IE"], ["354", "IS"], ["355", "AL"], ["358", "FI"], ["359", "BG"],
  ["36", "HU"], ["370", "LT"], ["371", "LV"], ["372", "EE"], ["380", "UA"],
  ["381", "RS"], ["385", "HR"], ["386", "SI"], ["39", "IT"], ["40", "RO"],
  ["41", "CH"], ["420", "CZ"], ["421", "SK"], ["43", "AT"], ["44", "GB"],
  ["45", "DK"], ["46", "SE"], ["47", "NO"], ["48", "PL"], ["49", "DE"],
  ["51", "PE"], ["52", "MX"], ["53", "CU"], ["54", "AR"], ["55", "BR"],
  ["56", "CL"], ["57", "CO"], ["58", "VE"], ["591", "BO"], ["593", "EC"],
  ["595", "PY"], ["598", "UY"], ["60", "MY"], ["61", "AU"], ["62", "ID"],
  ["63", "PH"], ["64", "NZ"], ["65", "SG"], ["66", "TH"], ["7", "RU"],
  ["81", "JP"], ["82", "KR"], ["84", "VN"], ["852", "HK"], ["855", "KH"],
  ["86", "CN"], ["880", "BD"], ["886", "TW"], ["90", "TR"], ["91", "IN"],
  ["92", "PK"], ["93", "AF"], ["94", "LK"], ["95", "MM"], ["960", "MV"],
  ["961", "LB"], ["962", "JO"], ["963", "SY"], ["964", "IQ"], ["965", "KW"],
  ["966", "SA"], ["967", "YE"], ["968", "OM"], ["971", "AE"], ["972", "IL"],
  ["973", "BH"], ["974", "QA"], ["975", "BT"], ["977", "NP"], ["98", "IR"],
  ["1", "US"],
  ["502", "GT"], ["503", "SV"], ["504", "HN"], ["505", "NI"], ["506", "CR"],
  ["507", "PA"],
];

const SORTED_CODES = [...DIAL_CODES].sort((a, b) => b[0].length - a[0].length);

export function countryFromPhone(e164: string): string | null {
  const digits = e164.replace(/[^\d]/g, "");
  for (const [code, iso] of SORTED_CODES) {
    if (digits.startsWith(code)) return iso;
  }
  return null;
}

export function normalizePhone(raw: string): string | null {
  const cleaned = String(raw ?? "").replace(/[^\d+]/g, "");
  const withPlus = cleaned.startsWith("+") ? cleaned : `+${cleaned}`;
  return /^\+[1-9]\d{6,15}$/.test(withPlus) ? withPlus : null;
}

const GSM7 =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM7_EXT = "^{}\\[~]|€";

export interface SegmentInfo {
  encoding: "GSM-7" | "UCS-2";
  segments: number;
  characters: number;
}

/** Count message segments exactly the way carriers bill them. */
export function measure(body: string): SegmentInfo {
  let units = 0;
  let gsm = true;
  for (const ch of body) {
    if (GSM7.includes(ch)) units += 1;
    else if (GSM7_EXT.includes(ch)) units += 2;
    else { gsm = false; break; }
  }
  if (!gsm) {
    const utf16 = [...body].reduce((n, ch) => n + (ch.codePointAt(0)! > 0xffff ? 2 : 1), 0);
    const segments = utf16 <= 70 ? 1 : Math.ceil(utf16 / 67);
    return { encoding: "UCS-2", segments: Math.max(segments, 1), characters: utf16 };
  }
  const segments = units <= 160 ? 1 : Math.ceil(units / 153);
  return { encoding: "GSM-7", segments: Math.max(segments, 1), characters: units };
}

export interface RateRow {
  country_iso: string;
  country_name: string;
  channel: string;
  cost_usd_per_segment: number;
  sell_usd_per_segment: number;
}

export interface PricingConfig {
  markup_multiplier: number;
  floor_usd_per_segment: number;
  credit_usd_value: number;
}

export interface Quote {
  countryIso: string;
  countryName: string;
  segments: number;
  encoding: string;
  sellUsd: number;
  costUsd: number;
  credits: number;
}

/** Price a message from the published rate card. Always rounds credits up. */
export function quote(
  body: string,
  countryIso: string | null,
  rates: RateRow[],
  cfg: PricingConfig,
  channel = "sms_outbound",
): Quote | null {
  const seg = measure(body);
  const iso = countryIso ?? "";
  const row =
    rates.find((r) => r.country_iso === iso && r.channel === channel) ??
    rates.find((r) => r.country_iso === "*" && r.channel === channel);
  if (!row) return null;
  const sellUsd = Number((row.sell_usd_per_segment * seg.segments).toFixed(6));
  const costUsd = Number((row.cost_usd_per_segment * seg.segments).toFixed(6));
  const credits = Math.ceil(sellUsd / cfg.credit_usd_value);
  return {
    countryIso: row.country_iso,
    countryName: row.country_name,
    segments: seg.segments,
    encoding: seg.encoding,
    sellUsd,
    costUsd,
    credits,
  };
}

/** Recompute a sell price from cost using the configured markup and floor. */
export function sellFromCost(cost: number, cfg: PricingConfig): number {
  return Math.max(Math.ceil(cost * cfg.markup_multiplier * 1000) / 1000, cfg.floor_usd_per_segment);
}

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** HMAC-SHA256 hex signature used for our own outbound webhook signing. */
export async function hmacHex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Public error codes. Upstream carrier text never reaches the caller. */
export const ERRORS = {
  unauthorized: [401, "unauthorized", "Missing or invalid API key."],
  key_revoked: [401, "key_revoked", "This API key has been revoked."],
  key_paused: [403, "key_paused", "This API key is paused."],
  account_suspended: [403, "account_suspended", "This account is suspended."],
  insufficient_credits: [402, "insufficient_credits", "Not enough credits to send this message."],
  invalid_destination: [400, "invalid_destination", "Destination is not a valid E.164 phone number."],
  destination_blocked: [403, "destination_blocked", "This destination country is not enabled on your account."],
  unpriced_destination: [400, "unpriced_destination", "No published rate exists for this destination."],
  rate_limited: [429, "rate_limited", "Rate limit exceeded."],
  invalid_request: [400, "invalid_request", "Request body failed validation."],
  not_found: [404, "not_found", "Resource not found."],
  delivery_failed: [502, "delivery_failed", "The network could not accept this message."],
  internal_error: [500, "internal_error", "Unexpected error."],
} as const;

export type ErrorCode = keyof typeof ERRORS;