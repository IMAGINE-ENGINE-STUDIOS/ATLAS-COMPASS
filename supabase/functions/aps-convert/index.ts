// Autodesk Platform Services (APS / Forge) → OBJ converter.
//
// Flow:
//   1. 2-legged OAuth (client_credentials) for data:read data:write
//      data:create bucket:create bucket:read
//   2. Ensure an OSS bucket exists for this project (transient)
//   3. Upload the user's file via signed S3 upload (single-part)
//   4. POST a Model Derivative job: { input: urn, output: { formats: [{ type: "obj" }] } }
//   5. Poll the manifest until success/failed
//   6. List derivatives, find the .obj, download it, return base64
//
// The OBJ is then loaded client-side and rendered identically to a
// native .obj import. APS supports SKP, STEP, IGES, IFC, RVT, RFA, MAX,
// VWX (via DWG export), DWG, etc.

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const APS_BASE = "https://developer.api.autodesk.com";
const CLIENT_ID = Deno.env.get("APS_CLIENT_ID");
const CLIENT_SECRET = Deno.env.get("APS_CLIENT_SECRET");
const SCOPES = "data:read data:write data:create bucket:create bucket:read";

function b64UrlSafe(s: string) {
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getToken(): Promise<string> {
  const body = new URLSearchParams({
    client_id: CLIENT_ID!,
    client_secret: CLIENT_SECRET!,
    grant_type: "client_credentials",
    scope: SCOPES,
  });
  const r = await fetch(`${APS_BASE}/authentication/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await r.json();
  if (!r.ok) throw new Error(`APS auth failed: ${r.status} ${JSON.stringify(json)}`);
  return json.access_token as string;
}

async function ensureBucket(token: string, bucketKey: string) {
  // GET first; create if 404.
  const head = await fetch(`${APS_BASE}/oss/v2/buckets/${bucketKey}/details`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (head.ok) return;
  const create = await fetch(`${APS_BASE}/oss/v2/buckets`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ bucketKey, policyKey: "transient" }),
  });
  if (!create.ok && create.status !== 409) {
    throw new Error(`Bucket create failed: ${create.status} ${await create.text()}`);
  }
}

async function uploadObject(
  token: string,
  bucketKey: string,
  objectKey: string,
  bytes: Uint8Array,
): Promise<string> {
  // Signed S3 upload (single-part). APS docs:
  // https://aps.autodesk.com/en/docs/data/v2/tutorials/app-managed-bucket/
  const signedRes = await fetch(
    `${APS_BASE}/oss/v2/buckets/${bucketKey}/objects/${encodeURIComponent(objectKey)}/signeds3upload?minutesExpiration=10`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!signedRes.ok) throw new Error(`signedS3 GET failed: ${signedRes.status} ${await signedRes.text()}`);
  const { uploadKey, urls } = await signedRes.json();

  const put = await fetch(urls[0], { method: "PUT", body: bytes });
  if (!put.ok) throw new Error(`S3 PUT failed: ${put.status} ${await put.text()}`);

  const complete = await fetch(
    `${APS_BASE}/oss/v2/buckets/${bucketKey}/objects/${encodeURIComponent(objectKey)}/signeds3upload`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ uploadKey }),
    },
  );
  if (!complete.ok) throw new Error(`signedS3 POST failed: ${complete.status} ${await complete.text()}`);
  const final = await complete.json();
  return final.objectId as string; // urn:adsk.objects:os.object:<bucket>/<key>
}

async function startTranslation(token: string, urn: string) {
  const r = await fetch(`${APS_BASE}/modelderivative/v2/designdata/job`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "x-ads-force": "true",
    },
    body: JSON.stringify({
      input: { urn },
      output: { formats: [{ type: "obj" }] },
    }),
  });
  if (!r.ok) throw new Error(`Translate failed: ${r.status} ${await r.text()}`);
  return await r.json();
}

async function pollManifest(token: string, urn: string, timeoutMs = 240_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const r = await fetch(`${APS_BASE}/modelderivative/v2/designdata/${urn}/manifest`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (r.ok) {
      const m = await r.json();
      if (m.status === "success") return m;
      if (m.status === "failed") throw new Error(`Translation failed: ${JSON.stringify(m)}`);
    }
    await new Promise((res) => setTimeout(res, 4000));
  }
  throw new Error("Translation timed out");
}

function findObjDerivative(manifest: any): string | null {
  // Walk derivatives.children recursively looking for type:"resource"
  // mime:"application/octet-stream" with role:"obj" or urn ending in .obj
  let found: string | null = null;
  const walk = (node: any) => {
    if (!node) return;
    const role = (node.role || "").toLowerCase();
    const urn = node.urn || "";
    if ((role === "obj" || urn.toLowerCase().endsWith(".obj")) && urn) {
      found = urn;
      return;
    }
    if (Array.isArray(node.children)) node.children.forEach(walk);
  };
  (manifest.derivatives || []).forEach(walk);
  return found;
}

async function downloadDerivative(token: string, urn: string, derivativeUrn: string): Promise<Uint8Array> {
  const r = await fetch(
    `${APS_BASE}/modelderivative/v2/designdata/${urn}/manifest/${encodeURIComponent(derivativeUrn)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!r.ok) throw new Error(`Derivative DL failed: ${r.status} ${await r.text()}`);
  return new Uint8Array(await r.arrayBuffer());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (!CLIENT_ID || !CLIENT_SECRET) {
    return new Response(
      JSON.stringify({ error: "APS credentials not configured. Set APS_CLIENT_ID and APS_CLIENT_SECRET." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const { fileName, fileBase64 } = await req.json();
    if (!fileName || !fileBase64) {
      return new Response(JSON.stringify({ error: "Missing fileName or fileBase64" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Decode base64
    const bin = atob(fileBase64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

    const token = await getToken();
    // Bucket key: lower-case, [a-z0-9_-], 3..128. Prefix with client id hash.
    const bucketKey = ("lvl-" + CLIENT_ID!.toLowerCase()).replace(/[^a-z0-9-]/g, "").slice(0, 100);
    await ensureBucket(token, bucketKey);

    const objectKey = `${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const objectId = await uploadObject(token, bucketKey, objectKey, bytes);
    const urn = b64UrlSafe(objectId);

    await startTranslation(token, urn);
    const manifest = await pollManifest(token, urn);
    const objUrn = findObjDerivative(manifest);
    if (!objUrn) throw new Error("Translation succeeded but no .obj derivative was produced");

    const objBytes = await downloadDerivative(token, urn, objUrn);
    let s = "";
    for (let i = 0; i < objBytes.length; i++) s += String.fromCharCode(objBytes[i]);
    const objBase64 = btoa(s);

    return new Response(JSON.stringify({ objBase64, fileName }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});