// glTF → USDZ converter proxy.
//
// The heavy lifting is done by `google/usd_from_gltf`
// (https://github.com/google/usd_from_gltf), which is a C++ binary
// that cannot run inside the Deno edge runtime. Instead this function
// forwards to a self-hosted worker (Fly.io / Cloud Run / your own VM)
// running usd_from_gltf behind a simple HTTP shim.
//
// Deploy the worker with something like:
//
//   FROM ubuntu:22.04
//   RUN apt-get update && apt-get install -y wget git build-essential cmake \
//       python3 python3-pip zlib1g-dev libpng-dev
//   RUN git clone https://github.com/google/usd_from_gltf /opt/ufg \
//    && cd /opt/ufg && python3 tools/ufginstall/ufginstall.py /opt/ufgout
//   COPY server.js /opt/server.js  # small express/fastify shim
//   CMD ["node", "/opt/server.js"]
//
// The shim should accept POST { fileBase64, fileName } and return
// { usdzBase64 }. Point USD_WORKER_URL at it.

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const USD_WORKER_URL = Deno.env.get("USD_WORKER_URL");
const USD_WORKER_TOKEN = Deno.env.get("USD_WORKER_TOKEN");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (!USD_WORKER_URL) {
    return new Response(
      JSON.stringify({
        error:
          "usd_from_gltf worker not configured. Deploy the worker and set the USD_WORKER_URL secret.",
        docs: "https://github.com/google/usd_from_gltf",
      }),
      { status: 501, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const body = await req.json();
    if (!body?.fileBase64 || !body?.fileName) {
      return new Response(
        JSON.stringify({ error: "Missing fileBase64 or fileName" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const upstream = await fetch(USD_WORKER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(USD_WORKER_TOKEN ? { Authorization: `Bearer ${USD_WORKER_TOKEN}` } : {}),
      },
      body: JSON.stringify(body),
    });

    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});