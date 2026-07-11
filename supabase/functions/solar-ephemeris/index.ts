import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

type Body = { id: string; name: string; command: string };

const BODIES: Body[] = [
  { id: 'sun', name: 'Sun', command: '10' },
  { id: 'mercury', name: 'Mercury', command: '199' },
  { id: 'venus', name: 'Venus', command: '299' },
  { id: 'moon', name: 'Moon', command: '301' },
  { id: 'mars', name: 'Mars', command: '499' },
  { id: 'jupiter', name: 'Jupiter', command: '599' },
  { id: 'saturn', name: 'Saturn', command: '699' },
  { id: 'uranus', name: 'Uranus', command: '799' },
  { id: 'neptune', name: 'Neptune', command: '899' },
];

let cache: { expires: number; body: string } | null = null;

function julianNow() {
  return Date.now() / 86_400_000 + 2_440_587.5;
}

function horizonsUrl(body: Body, jd: number) {
  const params = new URLSearchParams({
    format: 'json',
    COMMAND: body.command,
    OBJ_DATA: 'NO',
    MAKE_EPHEM: 'YES',
    EPHEM_TYPE: 'VECTORS',
    CENTER: '500@399',
    START_TIME: `JD${jd.toFixed(8)}`,
    STOP_TIME: `JD${(jd + 0.001).toFixed(8)}`,
    STEP_SIZE: '1',
    OUT_UNITS: 'KM-S',
    CSV_FORMAT: 'YES',
    VEC_TABLE: '2',
  });
  return `https://ssd.jpl.nasa.gov/api/horizons.api?${params.toString()}`;
}

function parseVector(body: Body, text: string) {
  const start = text.indexOf('$$SOE');
  const end = text.indexOf('$$EOE');
  if (start < 0 || end < 0 || end <= start) throw new Error(`No vector block for ${body.name}`);
  const line = text.slice(start + 5, end).split('\n').map((s) => s.trim()).find(Boolean);
  if (!line) throw new Error(`No vector row for ${body.name}`);
  const parts = line.split(',').map((s) => s.trim());
  if (parts.length < 8) throw new Error(`Malformed vector row for ${body.name}`);
  const n = (idx: number) => {
    const value = Number(parts[idx]);
    if (!Number.isFinite(value)) throw new Error(`Invalid vector value for ${body.name}`);
    return value;
  };
  return {
    id: body.id,
    name: body.name,
    jd: n(0),
    xM: n(2) * 1000,
    yM: n(3) * 1000,
    zM: n(4) * 1000,
    vxMS: n(5) * 1000,
    vyMS: n(6) * 1000,
    vzMS: n(7) * 1000,
  };
}

async function fetchBody(body: Body, jd: number) {
  const res = await fetch(horizonsUrl(body, jd), {
    headers: { 'Accept': 'application/json', 'User-Agent': 'atlas-solar-system/1.0' },
  });
  if (!res.ok) throw new Error(`Horizons ${body.name} ${res.status}`);
  const json = await res.json();
  if (json?.error) throw new Error(String(json.error));
  return parseVector(body, String(json?.result ?? ''));
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const now = Date.now();
    if (cache && cache.expires > now) {
      return new Response(cache.body, {
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=120' },
      });
    }

    const jd = julianNow();
    const fetched = [];
    // Horizons can reject bursty parallel traffic with transient 503s. Query
    // sequentially with a tiny gap so every vector still comes from the live
    // NASA/JPL service without hammering it.
    for (const body of BODIES) {
      try {
        fetched.push(await fetchBody(body, jd));
      } catch (_firstErr) {
        await wait(180);
        fetched.push(await fetchBody(body, jd));
      }
      await wait(80);
    }
    const body = JSON.stringify({
      source: 'NASA/JPL Horizons',
      center: 'Earth body center',
      generatedAt: new Date().toISOString(),
      vectors: [
        { id: 'earth', name: 'Earth', jd, xM: 0, yM: 0, zM: 0, vxMS: 0, vyMS: 0, vzMS: 0 },
        ...fetched,
      ],
    });
    cache = { expires: now + 120_000, body };
    return new Response(body, {
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=120' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String((err as Error).message ?? err) }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});