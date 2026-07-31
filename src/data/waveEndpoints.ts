/** Single source of truth for the public API reference — the docs render from this. */
export interface EndpointSpec {
  method: string;
  path: string;
  title: string;
  description: string;
  auth: "api_key" | "public";
  request?: string;
  response: string;
}

export const WAVE_ENDPOINTS: EndpointSpec[] = [
  {
    method: "POST",
    path: "/v1/messages",
    title: "Send a message",
    description:
      "Sends one SMS. Credits are reserved before dispatch, so a send either goes out fully paid or fails with insufficient_credits and charges nothing.",
    auth: "api_key",
    request: `{
  "to": "+15551234567",
  "body": "Flash flood warning for your area. Move to higher ground.",
  "callback_url": "https://yourapp.com/hooks/wave"
}`,
    response: `{
  "id": "9f1c...",
  "object": "message",
  "to": "+15551234567",
  "encoding": "GSM-7",
  "segments": 1,
  "country": "US",
  "credits_charged": 2,
  "status": "sent",
  "created_at": "2026-07-30T04:12:00Z"
}`,
  },
  {
    method: "GET",
    path: "/v1/messages/{id}",
    title: "Retrieve a message",
    description: "Current delivery status, billed segments and credits charged.",
    auth: "api_key",
    response: `{ "id": "9f1c...", "status": "delivered", "credits_charged": 2 }`,
  },
  {
    method: "GET",
    path: "/v1/messages",
    title: "List messages",
    description: "Most recent messages first. Accepts ?limit= up to 200.",
    auth: "api_key",
    response: `{ "object": "list", "data": [ { "id": "9f1c...", "status": "delivered" } ] }`,
  },
  {
    method: "POST",
    path: "/v1/estimate",
    title: "Estimate a send",
    description: "Prices a message without sending or charging. Useful for showing costs in your own UI.",
    auth: "api_key",
    request: `{ "to": "+5215555555555", "body": "Alerta sísmica" }`,
    response: `{
  "object": "estimate",
  "country": "MX",
  "encoding": "UCS-2",
  "segments": 1,
  "price_usd": 0.106,
  "price_credits": 11
}`,
  },
  {
    method: "POST",
    path: "/v1/subscriptions",
    title: "Register an alert subscriber",
    description:
      "Adds a phone number to your own hazard-alert audience with a location, radius, language and hazard filter. Re-posting the same number updates it.",
    auth: "api_key",
    request: `{
  "phone": "+51999888777",
  "language": "es",
  "hazards": ["earthquake", "tsunami"],
  "lat": -12.046,
  "lon": -77.043,
  "radius_km": 250,
  "min_severity": 2
}`,
    response: `{ "object": "subscription", "id": "3b7e...", "status": "active" }`,
  },
  {
    method: "GET",
    path: "/v1/subscriptions",
    title: "List subscribers",
    description: "Every subscriber registered under your account.",
    auth: "api_key",
    response: `{ "object": "list", "data": [ { "id": "3b7e...", "phone_e164": "+51999888777" } ] }`,
  },
  {
    method: "DELETE",
    path: "/v1/subscriptions/{id}",
    title: "Unsubscribe",
    description: "Marks a subscriber inactive. They stop receiving your broadcasts immediately.",
    auth: "api_key",
    response: `{ "object": "subscription", "status": "unsubscribed", "deleted": true }`,
  },
  {
    method: "POST",
    path: "/v1/alerts/broadcast",
    title: "Broadcast a hazard alert",
    description:
      "Fans out to every subscriber of yours inside the radius whose hazard and severity filters match. Each delivered message is billed at the destination's published rate.",
    auth: "api_key",
    request: `{
  "hazard": "earthquake",
  "severity": 4,
  "headline": "M6.2 earthquake 40km offshore",
  "body": "Strong shaking expected within 3 minutes. Drop, cover, hold on.",
  "lat": -12.046,
  "lon": -77.043,
  "radius_km": 300
}`,
    response: `{ "object": "alert", "recipients": 148, "credits_charged": 312, "status": "sent" }`,
  },
  {
    method: "GET",
    path: "/v1/alerts",
    title: "List broadcasts",
    description: "Every broadcast you have sent, with recipient counts and credits spent.",
    auth: "api_key",
    response: `{ "object": "list", "data": [ { "id": "aa10...", "recipients": 148 } ] }`,
  },
  {
    method: "GET",
    path: "/v1/balance",
    title: "Check balance",
    description: "Remaining credits, dollar equivalent and 30-day spend.",
    auth: "api_key",
    response: `{
  "object": "balance",
  "balance_credits": 8412,
  "balance_usd": 84.12,
  "credits_spent_30d": 1588
}`,
  },
  {
    method: "GET",
    path: "/v1/pricing",
    title: "Fetch the rate card",
    description: "The live published price for every destination. No API key required.",
    auth: "public",
    response: `{
  "object": "list",
  "credit_usd_value": 0.01,
  "data": [ { "country": "US", "price_usd": 0.016, "price_credits": 2 } ]
}`,
  },
];

export const WAVE_ERROR_CODES: Array<[string, number, string]> = [
  ["unauthorized", 401, "Missing or invalid API key."],
  ["key_revoked", 401, "The key was revoked in the dashboard."],
  ["key_paused", 403, "The key is temporarily paused."],
  ["account_suspended", 403, "The account is suspended."],
  ["insufficient_credits", 402, "Balance too low; nothing was sent or charged."],
  ["invalid_destination", 400, "Destination is not valid E.164."],
  ["destination_blocked", 403, "That country is not enabled on your account."],
  ["unpriced_destination", 400, "No published rate for that destination yet."],
  ["rate_limited", 429, "Per-second or daily limit exceeded."],
  ["invalid_request", 400, "Body failed validation."],
  ["not_found", 404, "No such resource."],
  ["delivery_failed", 502, "The network rejected the message; credits refunded automatically."],
  ["internal_error", 500, "Unexpected error on our side."],
];