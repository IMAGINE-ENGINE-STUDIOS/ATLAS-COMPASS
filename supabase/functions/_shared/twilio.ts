// Direct Twilio REST client (Basic auth with Account SID + Auth Token).
const ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID") ?? "";
const AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
const FROM_NUMBER = Deno.env.get("TWILIO_PHONE_NUMBER") ?? "";

export const twilioConfigured = () => Boolean(ACCOUNT_SID && AUTH_TOKEN && FROM_NUMBER);
export const twilioFrom = () => FROM_NUMBER;

export interface SendResult {
  ok: boolean;
  sid?: string;
  status?: number;
  error?: string;
}

/** Send an SMS (or WhatsApp when `channel === "whatsapp"`) through Twilio. */
export async function sendMessage(
  to: string,
  body: string,
  channel: "sms" | "whatsapp" = "sms",
): Promise<SendResult> {
  if (!twilioConfigured()) {
    return { ok: false, error: "Twilio is not configured (missing SID, token, or from number)" };
  }

  const prefix = channel === "whatsapp" ? "whatsapp:" : "";
  const form = new URLSearchParams({
    To: `${prefix}${to}`,
    From: `${prefix}${FROM_NUMBER}`,
    Body: body.slice(0, 1500),
  });

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${ACCOUNT_SID}:${AUTH_TOKEN}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
    },
  );

  const text = await res.text();
  if (!res.ok) {
    console.error(`Twilio send failed [${res.status}]: ${text}`);
    return { ok: false, status: res.status, error: text };
  }
  try {
    return { ok: true, sid: JSON.parse(text).sid, status: res.status };
  } catch {
    return { ok: true, status: res.status };
  }
}

/** Escape text for inclusion in a TwiML document. */
export function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Build a TwiML reply Twilio will deliver back to the sender. */
export function twiml(message?: string): Response {
  const body = message
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${xmlEscape(message)}</Message></Response>`
    : `<?xml version="1.0" encoding="UTF-8"?><Response/>`;
  return new Response(body, { headers: { "Content-Type": "text/xml; charset=utf-8" } });
}

/**
 * Verify Twilio's X-Twilio-Signature: HMAC-SHA1 of the full request URL with
 * every POST parameter appended in sorted key order, base64 encoded.
 * Guarantees inbound webhooks really came from Twilio.
 */
export async function verifySignature(
  signature: string | null,
  url: string,
  params: Record<string, string>,
): Promise<boolean> {
  if (!signature || !AUTH_TOKEN) return false;

  let payload = url;
  for (const key of Object.keys(params).sort()) payload += key + params[key];

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(AUTH_TOKEN),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));

  // Constant-time comparison.
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}