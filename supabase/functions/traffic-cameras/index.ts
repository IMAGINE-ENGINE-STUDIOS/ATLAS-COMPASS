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

interface CameraRow {
  id: string;
  name: string;
  lat: number;
  lng: number;
  image_url: string;
  source: string;
  stream_url?: string | null;
  refresh_rate?: number | null;
  feed_status?: string | null;
}

function toRadians(deg: number) {
  return (deg * Math.PI) / 180;
}

function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const dLat = toRadians(bLat - aLat);
  const dLng = toRadians(bLng - aLng);
  const lat1 = toRadians(aLat);
  const lat2 = toRadians(bLat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function normalizeBounds(input: Bounds): Bounds {
  const north = Math.min(90, Math.max(-90, Number(input.north)));
  const south = Math.min(90, Math.max(-90, Number(input.south)));
  const east = Math.min(180, Math.max(-180, Number(input.east)));
  const west = Math.min(180, Math.max(-180, Number(input.west)));
  return {
    north: Math.max(north, south),
    south: Math.min(north, south),
    east: Math.max(east, west),
    west: Math.min(east, west),
  };
}

function boundsCenter(bounds: Bounds) {
  return {
    lat: (bounds.north + bounds.south) / 2,
    lng: (bounds.east + bounds.west) / 2,
  };
}

function rowToCamera(row: CameraRow) {
  return {
    id: row.id,
    name: row.name,
    lat: Number(row.lat),
    lng: Number(row.lng),
    imageUrl: row.image_url,
    source: row.source,
    streamUrl: row.stream_url || undefined,
    refreshRate: row.refresh_rate || 10,
    feedVerified: row.feed_status === 'verified',
  };
}

function stableCameraId(prefix: string, explicitId: any, lat: number, lng: number, name: string): string {
  if (explicitId != null && String(explicitId).trim() !== '') return `${prefix}-${String(explicitId).trim()}`;
  const slug = (name || 'camera').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 42);
  return `${prefix}-${Math.round(lat * 1e5)}-${Math.round(lng * 1e5)}-${slug || 'camera'}`;
}

function validStreamUrl(url?: string): string | undefined {
  if (!url) return undefined;
  if (/\.(mjpg|mjpeg|m3u8|mp4)(\?|$)/i.test(url)) return url;
  if (/mjpeg|mjpg|\.stream|hls|playlist\.m3u|\/stream\//i.test(url)) return url;
  return undefined;
}

async function fetchCaltransForBounds(bounds: Bounds, limit: number) {
  // California is the most common failure mode when the DB cache is cold or a
  // broad sync partially failed. Query Caltrans directly for the current
  // viewport instead of blocking Atlas on a full nationwide ingest.
  const intersectsCA = bounds.north >= 32 && bounds.south <= 42.5 && bounds.east >= -125 && bounds.west <= -114;
  if (!intersectsCA) return [];

  const envelope = `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`;
  const url = new URL('https://caltrans-gis.dot.ca.gov/arcgis/rest/services/CHhighway/CCTV/FeatureServer/0/query');
  url.searchParams.set('where', "inService <> 'FALSE'");
  url.searchParams.set('outFields', 'OBJECTID,currentImageURL,streamingVideoURL,locationName,latitude,longitude,district,inService');
  url.searchParams.set('geometry', envelope);
  url.searchParams.set('geometryType', 'esriGeometryEnvelope');
  url.searchParams.set('inSR', '4326');
  url.searchParams.set('spatialRel', 'esriSpatialRelIntersects');
  url.searchParams.set('outSR', '4326');
  url.searchParams.set('f', 'json');
  url.searchParams.set('resultRecordCount', String(Math.min(Math.max(limit, 1), 120)));

  const resp = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) });
  if (!resp.ok) return [];
  const data = await resp.json().catch(() => null);
  const features = Array.isArray(data?.features) ? data.features : [];
  const center = boundsCenter(bounds);
  return features
    .map((f: any) => {
      const a = f.attributes || {};
      const lat = Number(a.latitude ?? f.geometry?.y);
      const lng = Number(a.longitude ?? f.geometry?.x);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      const imageUrl = String(a.currentImageURL || '').trim();
      if (!imageUrl) return null;
      const name = String(a.locationName || `Caltrans D${a.district || '?'} Camera`);
      return {
        id: stableCameraId('ca-live', a.OBJECTID, lat, lng, name),
        name,
        lat,
        lng,
        imageUrl,
        source: `Caltrans D${a.district || '?'}`,
        streamUrl: validStreamUrl(a.streamingVideoURL || ''),
        refreshRate: 5,
        feedVerified: false,
        _d: distanceKm(center.lat, center.lng, lat, lng),
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => a._d - b._d)
    .slice(0, limit)
    .map(({ _d, ...cam }: any) => cam);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { bounds: requestedBounds, cursor, limit: reqLimit } = await req.json() as {
      bounds: Bounds;
      cursor?: number;
      limit?: number;
    };

    if (!requestedBounds || requestedBounds.north == null || requestedBounds.south == null || requestedBounds.east == null || requestedBounds.west == null) {
      return new Response(
        JSON.stringify({ cameras: [], error: 'Invalid bounds' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const bounds = normalizeBounds(requestedBounds);

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
      .neq('lat', 0)
      .neq('lng', 0)
      .order('lat', { ascending: true })
      .order('lng', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      console.error('DB query error:', error);
      throw new Error(error.message);
    }

    const sourceRows = (data || []) as CameraRow[];
    const rows = sourceRows.filter((row: any) => (
      Math.abs(Number(row.lat) || 0) > 0.000001 || Math.abs(Number(row.lng) || 0) > 0.000001
    ));
    let cameras = rows.map(rowToCamera);

    // If the DB cache has no coverage for the current viewport, return a live
    // regional fallback where available instead of showing a dead/empty panel.
    if (cameras.length === 0 && offset === 0) {
      try {
        const live = await fetchCaltransForBounds(bounds, PAGE_SIZE);
        if (live.length > 0) {
          cameras = live;
        }
      } catch (e) {
        console.warn('Live regional camera fallback failed:', e);
      }
    }

    const total = cameras.length > 0 && sourceRows.length === 0 ? cameras.length : (count || 0);
    // Advance cursor by actual returned count to prevent skipping
    const nextOffset = offset + sourceRows.length;
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
