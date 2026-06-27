import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface Bounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { bounds, cursor, limit: reqLimit } = await req.json() as {
      bounds: Bounds;
      cursor?: number;
      limit?: number;
    };

    if (!bounds || bounds.north == null || bounds.south == null || bounds.east == null || bounds.west == null) {
      return new Response(
        JSON.stringify({ cameras: [], error: 'Invalid bounds' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Keep Intelligence responsive: Atlas renders these as live 3D pins, so a
    // single request must stay small even if a huge/worldwide bounds is sent.
    const PAGE_SIZE = Math.min(Math.max(reqLimit || 120, 1), 120);
    const offset = cursor || 0;

    // Query only the fields used by the UI. Selecting the full row plus sorting
    // by id caused slow broad-viewport scans and browser freezes downstream.
    const { data, error, count } = await supabase
      .from('camera_catalog')
      .select('id,name,lat,lng,image_url,source,stream_url,refresh_rate,feed_status', { count: 'estimated' })
      .gte('lat', bounds.south)
      .lte('lat', bounds.north)
      .gte('lng', bounds.west)
      .lte('lng', bounds.east)
      .order('lat', { ascending: true })
      .order('lng', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      console.error('DB query error:', error);
      throw new Error(error.message);
    }

    const rows = data || [];
    const cameras = rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      lat: row.lat,
      lng: row.lng,
      imageUrl: row.image_url,
      source: row.source,
      streamUrl: row.stream_url || undefined,
      refreshRate: row.refresh_rate || 10,
      feedVerified: row.feed_status === 'verified',
    }));

    const total = count || 0;
    // Advance cursor by actual returned count to prevent skipping
    const nextOffset = offset + rows.length;
    const hasMore = nextOffset < total;
    const nextCursor = hasMore ? nextOffset : undefined;

    console.log(`DB query: ${cameras.length} cameras (offset=${offset}, total=${total}) for bounds [${bounds.south.toFixed(1)},${bounds.west.toFixed(1)} → ${bounds.north.toFixed(1)},${bounds.east.toFixed(1)}]`);

    return new Response(
      JSON.stringify({ cameras, total, hasMore, nextCursor }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Traffic cameras error:', err);
    return new Response(
      JSON.stringify({ cameras: [], error: String(err) }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
