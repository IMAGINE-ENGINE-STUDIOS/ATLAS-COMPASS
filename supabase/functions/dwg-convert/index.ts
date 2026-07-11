// DWG → DXF/glTF converter proxy.
//
// DWG is a closed Autodesk format. Two open-source options exist,
// but both are native binaries and cannot run in the Deno edge
// runtime:
//
//   1. ODA File Converter (https://www.opendesign.com/guestfiles/oda_file_converter)
//      — free download, proprietary EULA. Best fidelity.
//   2. LibreDWG `dwg2dxf` (https://www.gnu.org/software/libredwg/)
//      — fully GPL, occasionally lossy on newer DWG revisions.
//
// Deploy either binary behind a small HTTP shim (Fly.io / Cloud Run /
// your own VM) that accepts POST { fileBase64, fileName } and returns
// { dxfBase64 } or { glbBase64 }. Point DWG_WORKER_URL at it, then
// the Imagine Engine editor will call this proxy transparently.
//
// When DWG_WORKER_URL is unset the function returns 501 with a hint
// so the client can fall back to Autodesk Platform Services (which
// is already wired via supabase/functions/aps-convert).

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const DWG_WORKER_URL = Deno.env.get("DWG_WORKER_URL");
const DWG_WORKER_TOKEN = Deno.env.get("DWG_WORKER_TOKEN");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (!DWG_WORKER_URL) {
    return new Response(
      JSON.stringify({
        error:
          "DWG worker not configured. Deploy ODA File Converter or LibreDWG behind an HTTP shim and set DWG_WORKER_URL.",
        fallback: "aps-convert",
        docs: "https://www.opendesign.com/source-code",
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

    const upstream = await fetch(DWG_WORKER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(DWG_WORKER_TOKEN ? { Authorization: `Bearer ${DWG_WORKER_TOKEN}` } : {}),
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