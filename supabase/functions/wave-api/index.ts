// ATLAS Signal — public developer API.
// All routes live under /v1. Responses are our own envelope; upstream network
// errors are mapped to Signal error codes and never surfaced verbatim.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  ERRORS,
  countryFromPhone,
  hmacHex,
  normalizePhone,
  quote,
  sha256Hex,
  type ErrorCode,
  type PricingConfig,
  type RateRow,
} from "../_shared/signal-billing.ts";
import { sendMessage, twilioConfigured } from "../_shared/twilio.ts";

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

function fail(code: ErrorCode, detail?: string) {
  const [status, slug, message] = ERRORS[code];
  return json({ error: { code: slug, message, detail: detail ?? null } }, status);
}

interface Ctx {
  accountId: string;
  ownerId: string;
  keyId: string;
  mode: "live" | "test";
  account: Record<string, any>;
}

async function authenticate(req: Request): Promise<Ctx | Response> {
  const header = req.headers.get("authorization") ?? "";
  const raw = header.replace(/^Bearer\s+/i, "").trim();
  if (!raw.startsWith("sig_")) return fail("unauthorized");

  const hash = await sha256Hex(raw);
  const { data: key } = await admin
    .from("signal_api_keys")
    .select("id, account_id, owner_id, mode, revoked_at, paused")
    .eq("key_hash", hash)
    .maybeSingle();
  if (!key) return fail("unauthorized");
  if (key.revoked_at) return fail("key_revoked");
  if (key.paused) return fail("key_paused");

  const { data: account } = await admin
    .from("signal_accounts")
    .select("*")
    .eq("id", key.account_id)
    .maybeSingle();
  if (!account) return fail("unauthorized");
  if (account.status !== "active") return fail("account_suspended", account.suspended_reason ?? undefined);

  admin.from("signal_api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", key.id)
    .then(() => {});

  return {
    accountId: key.account_id,
    ownerId: key.owner_id,
    keyId: key.id,
    mode: key.mode as "live" | "test",
    account,
  };
}

async function loadPricing(): Promise<{ cfg: PricingConfig; rates: RateRow[] }> {
  const [{ data: cfgRow }, { data: rates }] = await Promise.all([
    admin.from("signal_pricing_config").select("*").eq("id", 1).maybeSingle(),
    admin.from("signal_pricing_rates").select("*").order("country_name"),
  ]);
  return {
    cfg: {
      markup_multiplier: Number(cfgRow?.markup_multiplier ?? 2),
      floor_usd_per_segment: Number(cfgRow?.floor_usd_per_segment ?? 0.02),
      credit_usd_value: Number(cfgRow?.credit_usd_value ?? 0.01),
    },
    rates: (rates ?? []).map((r: any) => ({
      ...r,
      cost_usd_per_segment: Number(r.cost_usd_per_segment),
      sell_usd_per_segment: Number(r.sell_usd_per_segment),
    })),
  };
}

async function withinRateLimit(ctx: Ctx): Promise<boolean> {
  const since = new Date(Date.now() - 1000).toISOString();
  const [{ count: burst }, { count: today }] = await Promise.all([
    admin.from("signal_messages").select("id", { count: "exact", head: true })
      .eq("account_id", ctx.accountId).gte("created_at", since),
    admin.from("signal_messages").select("id", { count: "exact", head: true })
      .eq("account_id", ctx.accountId)
      .gte("created_at", new Date(Date.now() - 86_400_000).toISOString()),
  ]);
  if ((burst ?? 0) >= ctx.account.rate_limit_per_second) return false;
  if ((today ?? 0) >= ctx.account.rate_limit_per_day) return false;
  return true;
}

async function rollUsage(ctx: Ctx, patch: Record<string, number>) {
  const day = new Date().toISOString().slice(0, 10);
  const { data: existing } = await admin
    .from("signal_usage_daily")
    .select("*")
    .eq("account_id", ctx.accountId)
    .eq("day", day)
    .maybeSingle();
  const merged: Record<string, any> = {
    account_id: ctx.accountId,
    owner_id: ctx.ownerId,
    day,
    messages_sent: Number(existing?.messages_sent ?? 0) + (patch.messages_sent ?? 0),
    messages_delivered: Number(existing?.messages_delivered ?? 0) + (patch.messages_delivered ?? 0),
    messages_failed: Number(existing?.messages_failed ?? 0) + (patch.messages_failed ?? 0),
    credits_spent: Number(existing?.credits_spent ?? 0) + (patch.credits_spent ?? 0),
    cost_usd: Number(existing?.cost_usd ?? 0) + (patch.cost_usd ?? 0),
    revenue_usd: Number(existing?.revenue_usd ?? 0) + (patch.revenue_usd ?? 0),
    updated_at: new Date().toISOString(),
  };
  if (existing) await admin.from("signal_usage_daily").update(merged).eq("id", existing.id);
  else await admin.from("signal_usage_daily").insert(merged);
}

/** Fire the developer's own signed webhooks. Never blocks the API response. */
async function dispatchWebhooks(ownerId: string, event: string, payload: Record<string, unknown>) {
  const { data: hooks } = await admin
    .from("signal_webhooks")
    .select("id, url, events, signing_secret, enabled")
    .eq("owner_id", ownerId)
    .eq("enabled", true);
  for (const hook of hooks ?? []) {
    if (!(hook.events ?? []).includes(event)) continue;
    const ts = Math.floor(Date.now() / 1000).toString();
    const bodyText = JSON.stringify({ event, created: ts, data: payload });
    const signature = await hmacHex(hook.signing_secret, `${ts}.${bodyText}`);
    let status: number | null = null;
    let error: string | null = null;
    try {
      const res = await fetch(hook.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Atlas-Signature": `t=${ts},v1=${signature}`,
        },
        body: bodyText,
      });
      status = res.status;
      if (!res.ok) error = `HTTP ${res.status}`;
    } catch (e) {
      error = String(e);
    }
    await admin.from("signal_webhook_deliveries").insert({
      webhook_id: hook.id, owner_id: ownerId, event,
      payload, response_status: status, last_error: error,
    });
  }
}

function shapeMessage(m: Record<string, any>) {
  return {
    id: m.id,
    object: "message",
    mode: m.mode,
    direction: m.direction,
    to: m.to_phone,
    body: m.body,
    encoding: m.encoding,
    segments: m.segments,
    country: m.country_iso,
    credits_charged: Number(m.credits_charged),
    status: m.status,
    error_code: m.error_code,
    delivered_at: m.delivered_at,
    created_at: m.created_at,
  };
}

// ---------------------------------------------------------------- send
async function sendOne(
  ctx: Ctx,
  to: string,
  body: string,
  pricing: { cfg: PricingConfig; rates: RateRow[] },
  opts: { callbackUrl?: string | null; alertId?: string | null } = {},
) {
  const phone = normalizePhone(to);
  if (!phone) return { error: "invalid_destination" as ErrorCode };

  const iso = countryFromPhone(phone);
  const allow: string[] = ctx.account.country_allowlist ?? [];
  if (allow.length > 0 && iso && !allow.includes(iso)) {
    return { error: "destination_blocked" as ErrorCode };
  }

  const q = quote(body, iso, pricing.rates, pricing.cfg);
  if (!q) return { error: "unpriced_destination" as ErrorCode };

  const credits = ctx.mode === "test" ? 0 : q.credits;

  const { data: row, error: insErr } = await admin.from("signal_messages").insert({
    account_id: ctx.accountId,
    owner_id: ctx.ownerId,
    api_key_id: ctx.keyId,
    mode: ctx.mode,
    direction: "outbound",
    to_phone: phone,
    body,
    encoding: q.encoding,
    segments: q.segments,
    country_iso: q.countryIso,
    credits_charged: 0,
    cost_usd: ctx.mode === "test" ? 0 : q.costUsd,
    revenue_usd: ctx.mode === "test" ? 0 : q.sellUsd,
    status: "queued",
    callback_url: opts.callbackUrl ?? null,
    alert_id: opts.alertId ?? null,
  }).select().single();
  if (insErr || !row) return { error: "internal_error" as ErrorCode };

  if (credits > 0) {
    const { error: resErr } = await admin.rpc("signal_reserve_credits", {
      _account_id: ctx.accountId,
      _credits: credits,
      _kind: "debit",
      _reference: `msg:${row.id}`,
      _message_id: row.id,
      _note: `${q.segments} segment(s) to ${q.countryName}`,
    });
    if (resErr) {
      await admin.from("signal_messages")
        .update({ status: "failed", error_code: "insufficient_credits" })
        .eq("id", row.id);
      return { error: "insufficient_credits" as ErrorCode };
    }
    await admin.from("signal_messages").update({ credits_charged: credits }).eq("id", row.id);
  }

  if (ctx.mode === "test") {
    const { data: done } = await admin.from("signal_messages")
      .update({ status: "delivered", delivered_at: new Date().toISOString(), upstream_ref: `test_${row.id}` })
      .eq("id", row.id).select().single();
    await rollUsage(ctx, { messages_sent: 1, messages_delivered: 1 });
    return { message: done ?? row };
  }

  if (!twilioConfigured()) {
    await admin.from("signal_messages")
      .update({ status: "failed", error_code: "delivery_failed", error_detail: "network unavailable" })
      .eq("id", row.id);
    if (credits > 0) {
      await admin.rpc("signal_reserve_credits", {
        _account_id: ctx.accountId, _credits: -credits, _kind: "refund",
        _reference: `msg:${row.id}`, _message_id: row.id, _note: "automatic refund — delivery failed",
      });
    }
    return { error: "delivery_failed" as ErrorCode };
  }

  const result = await sendMessage(phone, body, "sms");
  if (!result.ok) {
    // Upstream detail is logged, never returned.
    console.error("signal send failed", result.status, result.error);
    await admin.from("signal_messages")
      .update({ status: "failed", error_code: "delivery_failed", error_detail: result.error ?? null })
      .eq("id", row.id);
    if (credits > 0) {
      await admin.rpc("signal_reserve_credits", {
        _account_id: ctx.accountId, _credits: -credits, _kind: "refund",
        _reference: `msg:${row.id}`, _message_id: row.id, _note: "automatic refund — delivery failed",
      });
    }
    await rollUsage(ctx, { messages_failed: 1 });
    return { error: "delivery_failed" as ErrorCode };
  }

  const { data: sent } = await admin.from("signal_messages")
    .update({ status: "sent", upstream_ref: result.sid ?? null })
    .eq("id", row.id).select().single();

  await rollUsage(ctx, {
    messages_sent: 1,
    credits_spent: credits,
    cost_usd: q.costUsd,
    revenue_usd: q.sellUsd,
  });
  return { message: sent ?? row };
}

// ---------------------------------------------------------------- router
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const path = url.pathname;
  // Depending on the gateway the path may arrive as /signal-api/v1/... or
  // /functions/v1/signal-api/v1/... — anchor on the function name.
  const all = path.split("/").filter(Boolean);
  const anchor = all.lastIndexOf("signal-api");
  const segs = anchor >= 0 ? all.slice(anchor + 1) : all;

  try {
    if (segs[0] !== "v1") {
      return json({
        service: "ATLAS Signal API",
        version: "1.0",
        docs: (Deno.env.get("SIGNAL_PUBLIC_URL") ?? "https://sos.atlasmapping.org") + "/developers/docs",
      });
    }

    const resource = segs[1] ?? "";
    const id = segs[2] ?? "";

    // Public: rate card requires no key.
    if (resource === "pricing" && req.method === "GET") {
      const { cfg, rates } = await loadPricing();
      return json({
        object: "list",
        credit_usd_value: cfg.credit_usd_value,
        data: rates.map((r) => ({
          country: r.country_iso,
          country_name: r.country_name,
          channel: r.channel,
          price_usd: r.sell_usd_per_segment,
          price_credits: Math.ceil(r.sell_usd_per_segment / cfg.credit_usd_value),
        })),
      });
    }

    const ctx = await authenticate(req);
    if (ctx instanceof Response) return ctx;

    // ---- balance
    if (resource === "balance" && req.method === "GET") {
      const { cfg } = await loadPricing();
      const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
      const { data: usage } = await admin.from("signal_usage_daily")
        .select("credits_spent").eq("account_id", ctx.accountId).gte("day", since);
      const spent30 = (usage ?? []).reduce((n, u: any) => n + Number(u.credits_spent), 0);
      return json({
        object: "balance",
        balance_credits: Number(ctx.account.balance_credits),
        balance_usd: Number((Number(ctx.account.balance_credits) * cfg.credit_usd_value).toFixed(2)),
        credits_spent_30d: spent30,
        low_balance_threshold: Number(ctx.account.low_balance_threshold),
        auto_topup_enabled: ctx.account.auto_topup_enabled,
      });
    }

    // ---- messages
    if (resource === "messages") {
      if (req.method === "POST") {
        if (!(await withinRateLimit(ctx))) return fail("rate_limited");
        const payload = await req.json().catch(() => null);
        const to = payload?.to;
        const body = payload?.body;
        if (typeof to !== "string" || typeof body !== "string" || !body.trim() || body.length > 1500) {
          return fail("invalid_request", "`to` and `body` are required; body max 1500 chars.");
        }
        const pricing = await loadPricing();
        const out = await sendOne(ctx, to, body, pricing, { callbackUrl: payload?.callback_url ?? null });
        if (out.error) return fail(out.error);
        dispatchWebhooks(ctx.ownerId, "message.sent", shapeMessage(out.message!)).catch(() => {});
        return json(shapeMessage(out.message!), 201);
      }
      if (req.method === "GET" && id) {
        const { data } = await admin.from("signal_messages").select("*")
          .eq("id", id).eq("account_id", ctx.accountId).maybeSingle();
        if (!data) return fail("not_found");
        return json(shapeMessage(data));
      }
      if (req.method === "GET") {
        const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
        const { data } = await admin.from("signal_messages").select("*")
          .eq("account_id", ctx.accountId).order("created_at", { ascending: false }).limit(limit);
        return json({ object: "list", data: (data ?? []).map(shapeMessage) });
      }
    }

    // ---- estimate (dry run, never charges)
    if (resource === "estimate" && req.method === "POST") {
      const payload = await req.json().catch(() => null);
      if (typeof payload?.to !== "string" || typeof payload?.body !== "string") {
        return fail("invalid_request");
      }
      const phone = normalizePhone(payload.to);
      if (!phone) return fail("invalid_destination");
      const pricing = await loadPricing();
      const q = quote(payload.body, countryFromPhone(phone), pricing.rates, pricing.cfg);
      if (!q) return fail("unpriced_destination");
      return json({
        object: "estimate",
        country: q.countryIso,
        country_name: q.countryName,
        encoding: q.encoding,
        segments: q.segments,
        price_usd: q.sellUsd,
        price_credits: q.credits,
      });
    }

    // ---- subscriptions
    if (resource === "subscriptions") {
      if (req.method === "POST") {
        const p = await req.json().catch(() => null);
        const phone = normalizePhone(p?.phone ?? "");
        if (!phone) return fail("invalid_destination");
        const record = {
          account_id: ctx.accountId,
          owner_id: ctx.ownerId,
          phone_e164: phone,
          language: typeof p?.language === "string" ? p.language.slice(0, 8) : "en",
          hazards: Array.isArray(p?.hazards) ? p.hazards.slice(0, 20).map(String) : [],
          lat: typeof p?.lat === "number" ? p.lat : null,
          lon: typeof p?.lon === "number" ? p.lon : null,
          radius_km: Number.isFinite(p?.radius_km) ? Math.min(Math.max(Number(p.radius_km), 1), 5000) : 300,
          min_severity: Number.isFinite(p?.min_severity) ? Number(p.min_severity) : 2,
          country_iso: countryFromPhone(phone),
          external_ref: typeof p?.external_ref === "string" ? p.external_ref.slice(0, 120) : null,
          status: "active",
        };
        const { data, error } = await admin.from("signal_subscriptions")
          .upsert(record, { onConflict: "account_id,phone_e164" }).select().single();
        if (error) return fail("internal_error", error.message);
        return json({ object: "subscription", ...data }, 201);
      }
      if (req.method === "GET") {
        const { data } = await admin.from("signal_subscriptions").select("*")
          .eq("account_id", ctx.accountId).order("created_at", { ascending: false }).limit(500);
        return json({ object: "list", data: data ?? [] });
      }
      if (req.method === "DELETE" && id) {
        const { data } = await admin.from("signal_subscriptions")
          .update({ status: "unsubscribed" }).eq("id", id).eq("account_id", ctx.accountId).select().maybeSingle();
        if (!data) return fail("not_found");
        return json({ object: "subscription", id, status: "unsubscribed", deleted: true });
      }
    }

    // ---- alert broadcast
    if (resource === "alerts") {
      if (req.method === "POST" && (id === "broadcast" || segs[2] === "broadcast")) {
        const p = await req.json().catch(() => null);
        if (typeof p?.headline !== "string" || typeof p?.body !== "string") {
          return fail("invalid_request", "`headline` and `body` are required.");
        }
        const hazard = typeof p?.hazard === "string" ? p.hazard : "general";
        const lat = typeof p?.lat === "number" ? p.lat : null;
        const lon = typeof p?.lon === "number" ? p.lon : null;
        const radius = Number.isFinite(p?.radius_km) ? Number(p.radius_km) : 300;
        const severity = Number.isFinite(p?.severity) ? Number(p.severity) : 3;

        const { data: subs } = await admin.from("signal_subscriptions").select("*")
          .eq("account_id", ctx.accountId).eq("status", "active");

        const targets = (subs ?? []).filter((s: any) => {
          if (s.min_severity > severity) return false;
          if ((s.hazards ?? []).length && !s.hazards.includes(hazard)) return false;
          if (lat === null || lon === null || s.lat === null || s.lon === null) return true;
          const dLat = (s.lat - lat) * 111;
          const dLon = (s.lon - lon) * 111 * Math.cos((lat * Math.PI) / 180);
          return Math.hypot(dLat, dLon) <= Math.min(radius, s.radius_km);
        });

        const { data: alert } = await admin.from("signal_alerts").insert({
          account_id: ctx.accountId, owner_id: ctx.ownerId, hazard, severity,
          headline: p.headline, body: p.body, lat, lon, radius_km: radius,
          mode: ctx.mode, status: "sending",
        }).select().single();

        const text = `${p.headline}\n${p.body}`.slice(0, 1400);
        const pricing = await loadPricing();
        let delivered = 0;
        let credits = 0;
        for (const s of targets) {
          const out = await sendOne(ctx, s.phone_e164, text, pricing, { alertId: alert?.id ?? null });
          if (out.message) { delivered++; credits += Number(out.message.credits_charged ?? 0); }
          if (out.error === "insufficient_credits") break;
        }
        const { data: finalAlert } = await admin.from("signal_alerts")
          .update({ recipients: delivered, credits_charged: credits, status: "sent" })
          .eq("id", alert!.id).select().single();
        dispatchWebhooks(ctx.ownerId, "alert.sent", finalAlert ?? {}).catch(() => {});
        return json({ object: "alert", ...finalAlert, targeted: targets.length }, 201);
      }
      if (req.method === "GET") {
        const { data } = await admin.from("signal_alerts").select("*")
          .eq("account_id", ctx.accountId).order("created_at", { ascending: false }).limit(100);
        return json({ object: "list", data: data ?? [] });
      }
    }

    return fail("not_found", `No route for ${req.method} ${path}`);
  } catch (e) {
    console.error("signal-api error", e);
    return fail("internal_error");
  }
});