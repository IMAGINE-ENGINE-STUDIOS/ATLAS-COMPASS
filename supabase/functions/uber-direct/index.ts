import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

let cachedToken: { access_token: string; expires_at: number } | null = null;

async function getUberToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expires_at - 60000) {
    return cachedToken.access_token;
  }

  const clientId = Deno.env.get("UBER_CLIENT_ID");
  const clientSecret = Deno.env.get("UBER_CLIENT_SECRET");

  if (!clientId || !clientSecret) {
    throw new Error("Uber credentials not configured");
  }

  const res = await fetch("https://login.uber.com/oauth/v2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
      scope: "eats.deliveries",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OAuth failed [${res.status}]: ${err}`);
  }

  const data = await res.json();
  cachedToken = {
    access_token: data.access_token,
    expires_at: Date.now() + (data.expires_in || 1800) * 1000,
  };
  return cachedToken.access_token;
}

function getCustomerId(): string {
  const id = Deno.env.get("UBER_CUSTOMER_ID");
  if (!id) throw new Error("UBER_CUSTOMER_ID not configured");
  return id;
}

const UBER_BASE = "https://api.uber.com/v1/customers";

function jsonResponse(data: unknown, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const path = url.pathname.split("/uber-direct")[1] || "/";
    const token = await getUberToken();
    const customerId = getCustomerId();
    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    // ─── GET /quote — Get delivery quote ───
    if (path === "/quote" && req.method === "POST") {
      const body = await req.json();
      if (!body.pickup_address || !body.dropoff_address) {
        return jsonResponse({ error: "pickup_address and dropoff_address required" }, 400);
      }
      const uberRes = await fetch(`${UBER_BASE}/${customerId}/delivery_quotes`, {
        method: "POST", headers,
        body: JSON.stringify({
          pickup_address: body.pickup_address,
          dropoff_address: body.dropoff_address,
          ...(body.dropoff_latitude && { dropoff_latitude: body.dropoff_latitude }),
          ...(body.dropoff_longitude && { dropoff_longitude: body.dropoff_longitude }),
          ...(body.pickup_latitude && { pickup_latitude: body.pickup_latitude }),
          ...(body.pickup_longitude && { pickup_longitude: body.pickup_longitude }),
        }),
      });
      return jsonResponse(await uberRes.json(), uberRes.ok ? 200 : uberRes.status);
    }

    // ─── POST /create — Create delivery ───
    if (path === "/create" && req.method === "POST") {
      const body = await req.json();
      if (!body.quote_id || !body.pickup || !body.dropoff || !body.manifest) {
        return jsonResponse({ error: "quote_id, pickup, dropoff, and manifest required" }, 400);
      }
      const payload: Record<string, unknown> = {
        quote_id: body.quote_id,
        pickup: body.pickup,
        dropoff: body.dropoff,
        manifest: body.manifest,
      };
      if (body.deliverable_action) payload.deliverable_action = body.deliverable_action;
      if (body.manifest_items) payload.manifest_items = body.manifest_items;
      if (body.pickup_notes) payload.pickup.notes = body.pickup_notes;
      if (body.dropoff_notes) payload.dropoff.notes = body.dropoff_notes;
      if (body.tip) payload.tip = body.tip;
      if (body.idempotency_key) payload.idempotency_key = body.idempotency_key;
      if (body.undeliverable_action) payload.undeliverable_action = body.undeliverable_action;
      if (body.external_id) payload.external_id = body.external_id;
      if (body.external_store_id) payload.external_store_id = body.external_store_id;
      if (body.requires_dropoff_signature) payload.requires_dropoff_signature = body.requires_dropoff_signature;
      if (body.requires_id_verification) payload.requires_id_verification = body.requires_id_verification;
      if (body.pickup_ready_dt) payload.pickup_ready_dt = body.pickup_ready_dt;
      if (body.pickup_deadline_dt) payload.pickup_deadline_dt = body.pickup_deadline_dt;
      if (body.dropoff_ready_dt) payload.dropoff_ready_dt = body.dropoff_ready_dt;
      if (body.dropoff_deadline_dt) payload.dropoff_deadline_dt = body.dropoff_deadline_dt;

      const uberRes = await fetch(`${UBER_BASE}/${customerId}/deliveries`, {
        method: "POST", headers,
        body: JSON.stringify(payload),
      });
      return jsonResponse(await uberRes.json(), uberRes.ok ? 200 : uberRes.status);
    }

    // ─── GET /status?id=xxx — Get delivery status ───
    if (path === "/status" && req.method === "GET") {
      const deliveryId = url.searchParams.get("id");
      if (!deliveryId) return jsonResponse({ error: "id parameter required" }, 400);
      const uberRes = await fetch(`${UBER_BASE}/${customerId}/deliveries/${deliveryId}`, {
        method: "GET", headers,
      });
      return jsonResponse(await uberRes.json(), uberRes.ok ? 200 : uberRes.status);
    }

    // ─── GET /list — List all deliveries ───
    if (path === "/list" && req.method === "GET") {
      const filter = url.searchParams.get("filter") || "";
      const limit = url.searchParams.get("limit") || "50";
      const offset = url.searchParams.get("offset") || "0";
      let endpoint = `${UBER_BASE}/${customerId}/deliveries?limit=${limit}&offset=${offset}`;
      if (filter) endpoint += `&filter=${encodeURIComponent(filter)}`;
      const uberRes = await fetch(endpoint, { method: "GET", headers });
      return jsonResponse(await uberRes.json(), uberRes.ok ? 200 : uberRes.status);
    }

    // ─── POST /cancel — Cancel delivery ───
    if (path === "/cancel" && req.method === "POST") {
      const body = await req.json();
      if (!body.delivery_id) return jsonResponse({ error: "delivery_id required" }, 400);
      const uberRes = await fetch(`${UBER_BASE}/${customerId}/deliveries/${body.delivery_id}/cancel`, {
        method: "POST", headers,
      });
      return jsonResponse(await uberRes.json(), uberRes.ok ? 200 : uberRes.status);
    }

    // ─── POST /tip — Update tip for a delivery ───
    if (path === "/tip" && req.method === "POST") {
      const body = await req.json();
      if (!body.delivery_id || body.tip_amount === undefined) {
        return jsonResponse({ error: "delivery_id and tip_amount required" }, 400);
      }
      const uberRes = await fetch(`${UBER_BASE}/${customerId}/deliveries/${body.delivery_id}`, {
        method: "PATCH", headers,
        body: JSON.stringify({ tip_by_customer: body.tip_amount }),
      });
      return jsonResponse(await uberRes.json(), uberRes.ok ? 200 : uberRes.status);
    }

    // ─── GET /pod?id=xxx — Get proof of delivery ───
    if (path === "/pod" && req.method === "GET") {
      const deliveryId = url.searchParams.get("id");
      if (!deliveryId) return jsonResponse({ error: "id parameter required" }, 400);
      const uberRes = await fetch(`${UBER_BASE}/${customerId}/deliveries/${deliveryId}`, {
        method: "GET", headers,
      });
      const data = await uberRes.json();
      // Extract POD from delivery response
      return jsonResponse({
        delivery_id: deliveryId,
        status: data.status,
        proof_of_delivery: data.related?.proof_of_delivery || null,
        signature: data.related?.signature || null,
        photo: data.related?.photo || null,
        pin_code_verified: data.related?.pin_code_verified || null,
        dropoff_verification: data.dropoff_verification || null,
        courier: data.courier || null,
        complete_dt: data.complete_dt || null,
      }, uberRes.ok ? 200 : uberRes.status);
    }

    // ─── POST /update — Update a delivery in progress ───
    if (path === "/update" && req.method === "POST") {
      const body = await req.json();
      if (!body.delivery_id) return jsonResponse({ error: "delivery_id required" }, 400);
      const updates: Record<string, unknown> = {};
      if (body.dropoff_notes) updates.dropoff_notes = body.dropoff_notes;
      if (body.pickup_notes) updates.pickup_notes = body.pickup_notes;
      if (body.manifest_items) updates.manifest_items = body.manifest_items;
      if (body.requires_dropoff_signature !== undefined) updates.requires_dropoff_signature = body.requires_dropoff_signature;
      if (body.tip_by_customer !== undefined) updates.tip_by_customer = body.tip_by_customer;

      const uberRes = await fetch(`${UBER_BASE}/${customerId}/deliveries/${body.delivery_id}`, {
        method: "PATCH", headers,
        body: JSON.stringify(updates),
      });
      return jsonResponse(await uberRes.json(), uberRes.ok ? 200 : uberRes.status);
    }

    // ─── POST /batch-quote — Get multiple quotes at once ───
    if (path === "/batch-quote" && req.method === "POST") {
      const body = await req.json();
      if (!body.requests || !Array.isArray(body.requests)) {
        return jsonResponse({ error: "requests array required" }, 400);
      }
      const results = await Promise.allSettled(
        body.requests.map(async (r: { pickup_address: string; dropoff_address: string }) => {
          const uberRes = await fetch(`${UBER_BASE}/${customerId}/delivery_quotes`, {
            method: "POST", headers,
            body: JSON.stringify({
              pickup_address: r.pickup_address,
              dropoff_address: r.dropoff_address,
            }),
          });
          return uberRes.json();
        })
      );
      return jsonResponse({
        quotes: results.map((r, i) => ({
          index: i,
          status: r.status,
          data: r.status === "fulfilled" ? r.value : null,
          error: r.status === "rejected" ? String(r.reason) : null,
        })),
      }, 200);
    }

    // ─── POST /estimate — Lightweight fee estimate without creating a real quote ───
    if (path === "/estimate" && req.method === "POST") {
      const body = await req.json();
      if (!body.pickup_address || !body.dropoff_address) {
        return jsonResponse({ error: "pickup_address and dropoff_address required" }, 400);
      }
      const uberRes = await fetch(`${UBER_BASE}/${customerId}/delivery_quotes`, {
        method: "POST", headers,
        body: JSON.stringify({
          pickup_address: body.pickup_address,
          dropoff_address: body.dropoff_address,
        }),
      });
      const data = await uberRes.json();
      return jsonResponse({
        fee: data.fee,
        currency: data.currency,
        estimated_at: data.created,
        eta: data.duration,
        kind: data.kind,
        expires_at: data.expires,
      }, uberRes.ok ? 200 : uberRes.status);
    }

    return jsonResponse({
      error: "Unknown endpoint",
      available: ["/quote", "/create", "/status", "/list", "/cancel", "/tip", "/pod", "/update", "/batch-quote", "/estimate"],
    }, 404);

  } catch (error) {
    console.error("Uber Direct error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});
