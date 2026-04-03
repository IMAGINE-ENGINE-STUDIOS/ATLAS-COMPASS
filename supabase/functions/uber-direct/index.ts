import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// In-memory token cache
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

    // POST /quote — Get delivery quote
    if (path === "/quote" && req.method === "POST") {
      const body = await req.json();
      
      if (!body.pickup_address || !body.dropoff_address) {
        return new Response(JSON.stringify({ error: "pickup_address and dropoff_address required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const uberRes = await fetch(`${UBER_BASE}/${customerId}/delivery_quotes`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          pickup_address: body.pickup_address,
          dropoff_address: body.dropoff_address,
        }),
      });

      const data = await uberRes.json();
      return new Response(JSON.stringify(data), {
        status: uberRes.ok ? 200 : uberRes.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST /create — Create delivery
    if (path === "/create" && req.method === "POST") {
      const body = await req.json();

      if (!body.quote_id || !body.pickup || !body.dropoff || !body.manifest) {
        return new Response(JSON.stringify({ error: "quote_id, pickup, dropoff, and manifest required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const uberRes = await fetch(`${UBER_BASE}/${customerId}/deliveries`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          quote_id: body.quote_id,
          pickup: body.pickup,
          dropoff: body.dropoff,
          manifest: body.manifest,
        }),
      });

      const data = await uberRes.json();
      return new Response(JSON.stringify(data), {
        status: uberRes.ok ? 200 : uberRes.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // GET /status?id=xxx — Get delivery status
    if (path === "/status" && req.method === "GET") {
      const deliveryId = url.searchParams.get("id");
      if (!deliveryId) {
        return new Response(JSON.stringify({ error: "id parameter required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const uberRes = await fetch(`${UBER_BASE}/${customerId}/deliveries/${deliveryId}`, {
        method: "GET",
        headers,
      });

      const data = await uberRes.json();
      return new Response(JSON.stringify(data), {
        status: uberRes.ok ? 200 : uberRes.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST /cancel — Cancel delivery
    if (path === "/cancel" && req.method === "POST") {
      const body = await req.json();
      if (!body.delivery_id) {
        return new Response(JSON.stringify({ error: "delivery_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const uberRes = await fetch(`${UBER_BASE}/${customerId}/deliveries/${body.delivery_id}/cancel`, {
        method: "POST",
        headers,
      });

      const data = await uberRes.json();
      return new Response(JSON.stringify(data), {
        status: uberRes.ok ? 200 : uberRes.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown endpoint", available: ["/quote", "/create", "/status", "/cancel"] }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Uber Direct error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
