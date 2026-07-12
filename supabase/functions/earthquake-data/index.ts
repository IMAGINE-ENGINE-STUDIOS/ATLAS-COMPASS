import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    // Two upstream USGS APIs are supported:
    //   1) Summary feeds (?feed=2.5_day) — original behavior, prebuilt.
    //   2) Search / query (?mode=search&starttime=&endtime=&minmagnitude=&
    //      maxmagnitude=&minlatitude=&maxlatitude=&minlongitude=&
    //      maxlongitude=&limit=&orderby=)
    //      — mirrors https://earthquake.usgs.gov/earthquakes/search/, which
    //      is powered server-side by the FDSNWS event endpoint.
    const mode = (url.searchParams.get('mode') ?? '').toLowerCase();
    let upstream: string;
    let cacheSeconds = 60;
    if (mode === 'search') {
      // Whitelist of FDSNWS event params we forward. Everything else is
      // dropped so this proxy cannot be turned into a generic USGS relay.
      const allowed = [
        'starttime', 'endtime', 'updatedafter',
        'minmagnitude', 'maxmagnitude',
        'mindepth', 'maxdepth',
        'minlatitude', 'maxlatitude', 'minlongitude', 'maxlongitude',
        'latitude', 'longitude', 'maxradiuskm',
        'eventtype', 'orderby', 'limit', 'offset',
        'alertlevel', 'reviewstatus',
      ] as const;
      const q = new URLSearchParams();
      q.set('format', 'geojson');
      for (const key of allowed) {
        const v = url.searchParams.get(key);
        if (v == null || v === '') continue;
        // Coarse validation — reject anything that isn't a safe atom.
        if (!/^[-+.:0-9A-Za-z_,]{1,64}$/.test(v)) {
          return new Response(JSON.stringify({ error: `invalid ${key}` }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        q.set(key, v);
      }
      // Cap limit so a bad request can't ask USGS for 20 000 events.
      const lim = Number(q.get('limit') ?? '1000');
      q.set('limit', String(Math.max(1, Math.min(20000, isNaN(lim) ? 1000 : lim))));
      // Institutional-grade FDSNWS event data centers. Every one of these
      // is a nationally/internationally operated seismic authority that
      // publishes near-real-time and historic catalog data using the same
      // FDSN standard, so we can proxy them with a single whitelist.
      const source = (url.searchParams.get('source') ?? 'usgs').toLowerCase();
      const SOURCES: Record<string, string> = {
        usgs:   'https://earthquake.usgs.gov/fdsnws/event/1/query',       // U.S. Geological Survey (NEIC)
        emsc:   'https://www.seismicportal.eu/fdsnws/event/1/query',      // European-Mediterranean Seismological Centre
        iris:   'https://service.iris.edu/fdsnws/event/1/query',          // IRIS DMC (global research consortium)
        isc:    'https://www.isc.ac.uk/fdsnws/event/1/query',             // International Seismological Centre
        geofon: 'https://geofon.gfz-potsdam.de/fdsnws/event/1/query',     // GEOFON / GFZ Potsdam
      };
      const base = SOURCES[source] ?? SOURCES.usgs;
      upstream = `${base}?${q.toString()}`;
      cacheSeconds = source === 'usgs' || source === 'emsc' ? 30 : 120;
    } else {
      const feed = url.searchParams.get('feed') ?? '2.5_day';
      if (!/^[a-z0-9._]+_(hour|day|week|month)$/i.test(feed)) {
        return new Response(JSON.stringify({ error: 'invalid feed' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      upstream = `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/${feed}.geojson`;
    }
    const r = await fetch(upstream, { headers: { 'User-Agent': 'atlas-earth-intel/1.0' } });
    if (!r.ok) {
      const errText = await r.text().catch(() => '');
      return new Response(JSON.stringify({ error: `upstream ${r.status}`, details: errText.slice(0, 500) }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const body = await r.text();
    return new Response(body, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/geo+json',
        'Cache-Control': `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds}`,
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});