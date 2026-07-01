import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

// Blitzortung splits the world into slices. Frontend can request one or many
// slices (?slices=0,1,2,...); default is a broad global sweep (0..9).
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const raw = url.searchParams.get('slices') ?? '0,1,2,3,4,5,6,7,8,9';
    const slices = raw
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isInteger(n) && n >= 0 && n <= 99)
      .slice(0, 20);
    if (slices.length === 0) {
      return new Response(JSON.stringify({ error: 'invalid slices' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const features: any[] = [];
    await Promise.all(
      slices.map(async (slice) => {
        try {
          const r = await fetch(
            `https://map.blitzortung.org/GEOjson/getjson.php?f=s&n=${slice}`,
            {
              headers: {
                'User-Agent': 'atlas-earth-intel/1.0',
                Referer: 'https://map.blitzortung.org/',
              },
            },
          );
          if (!r.ok) return;
          const text = await r.text();
          // Blitzortung sometimes returns NDJSON-ish streams — try parsing per-line.
          try {
            const j = JSON.parse(text);
            const feats = Array.isArray(j?.features) ? j.features : Array.isArray(j) ? j : [];
            for (const f of feats) features.push(f);
          } catch {
            for (const line of text.split('\n')) {
              const t = line.trim();
              if (!t) continue;
              try {
                const j = JSON.parse(t);
                if (j?.type === 'Feature') features.push(j);
                else if (Array.isArray(j?.features)) features.push(...j.features);
              } catch { /* skip */ }
            }
          }
        } catch { /* per-slice failures are silent */ }
      }),
    );

    const body = JSON.stringify({
      type: 'FeatureCollection',
      generated: new Date().toISOString(),
      count: features.length,
      features,
    });
    return new Response(body, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/geo+json',
        'Cache-Control': 'public, max-age=30, s-maxage=30',
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});