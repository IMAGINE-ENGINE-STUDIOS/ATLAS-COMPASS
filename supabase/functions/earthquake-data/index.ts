import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    // Allowed feeds: {mag}_{window} e.g. 2.5_day, significant_week, all_hour
    const feed = url.searchParams.get('feed') ?? '2.5_day';
    if (!/^[a-z0-9._]+_(hour|day|week|month)$/i.test(feed)) {
      return new Response(JSON.stringify({ error: 'invalid feed' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const upstream = `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/${feed}.geojson`;
    const r = await fetch(upstream, { headers: { 'User-Agent': 'atlas-earth-intel/1.0' } });
    if (!r.ok) {
      return new Response(JSON.stringify({ error: `upstream ${r.status}` }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const body = await r.text();
    return new Response(body, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/geo+json',
        'Cache-Control': 'public, max-age=60, s-maxage=60',
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});