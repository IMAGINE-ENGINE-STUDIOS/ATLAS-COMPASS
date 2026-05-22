import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const GATEWAY = 'https://connector-gateway.lovable.dev/google_maps';

interface Body {
  query: string;
  center?: { lat: number; lng: number };
  radiusMeters?: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  const GOOGLE_MAPS_API_KEY = Deno.env.get('GOOGLE_MAPS_API_KEY');
  if (!LOVABLE_API_KEY || !GOOGLE_MAPS_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'Google Maps connector not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  let body: Body;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const query = (body.query ?? '').toString().trim();
  if (query.length < 2 || query.length > 200) {
    return new Response(JSON.stringify({ results: [] }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const center = body.center && Number.isFinite(body.center.lat) && Number.isFinite(body.center.lng)
    ? body.center : null;
  const radius = Math.min(Math.max(Number(body.radiusMeters) || 50000, 500), 50000);

  const auth = {
    'Authorization': `Bearer ${LOVABLE_API_KEY}`,
    'X-Connection-Api-Key': GOOGLE_MAPS_API_KEY,
    'Content-Type': 'application/json',
  };

  type R = {
    name: string; lat: number; lng: number; type: string;
    address?: string; phone?: string; website?: string;
    rating?: number; ratingCount?: number; source: 'google';
    placeId?: string;
  };
  const results: R[] = [];

  // 1) Places API (New) Text Search
  try {
    const payload: Record<string, unknown> = { textQuery: query, maxResultCount: 15 };
    if (center) payload.locationBias = {
      circle: { center: { latitude: center.lat, longitude: center.lng }, radius },
    };
    const resp = await fetch(`${GATEWAY}/places/v1/places:searchText`, {
      method: 'POST',
      headers: {
        ...auth,
        'X-Goog-FieldMask': [
          'places.id','places.displayName','places.formattedAddress','places.location',
          'places.types','places.primaryType','places.rating','places.userRatingCount',
          'places.websiteUri','places.nationalPhoneNumber',
        ].join(','),
      },
      body: JSON.stringify(payload),
    });
    if (resp.ok) {
      const data = await resp.json();
      for (const p of (data?.places ?? [])) {
        const lat = p?.location?.latitude, lng = p?.location?.longitude;
        if (typeof lat !== 'number' || typeof lng !== 'number') continue;
        results.push({
          name: p?.displayName?.text || p?.formattedAddress || 'Unnamed',
          lat, lng,
          type: (p?.primaryType || p?.types?.[0] || 'Place').replace(/_/g, ' '),
          address: p?.formattedAddress,
          phone: p?.nationalPhoneNumber,
          website: p?.websiteUri,
          rating: typeof p?.rating === 'number' ? p.rating : undefined,
          ratingCount: typeof p?.userRatingCount === 'number' ? p.userRatingCount : undefined,
          placeId: p?.id,
          source: 'google',
        });
      }
    } else {
      console.warn('places searchText failed', resp.status, await resp.text());
    }
  } catch (e) {
    console.warn('places searchText error', e);
  }

  // 2) Geocoding fallback when Places returned nothing (address-like queries)
  if (results.length === 0) {
    try {
      const resp = await fetch(
        `${GATEWAY}/maps/api/geocode/json?address=${encodeURIComponent(query)}`,
        { headers: { 'Authorization': auth.Authorization, 'X-Connection-Api-Key': auth['X-Connection-Api-Key'] } },
      );
      if (resp.ok) {
        const data = await resp.json();
        for (const g of (data?.results ?? []).slice(0, 10)) {
          const lat = g?.geometry?.location?.lat, lng = g?.geometry?.location?.lng;
          if (typeof lat !== 'number' || typeof lng !== 'number') continue;
          results.push({
            name: g?.formatted_address || 'Address',
            lat, lng,
            type: 'Address',
            address: g?.formatted_address,
            placeId: g?.place_id,
            source: 'google',
          });
        }
      }
    } catch (e) {
      console.warn('geocode error', e);
    }
  }

  return new Response(JSON.stringify({ results }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});