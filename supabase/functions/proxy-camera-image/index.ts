import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let imageUrl: string | null = null;
    
    if (req.method === 'GET') {
      const params = new URL(req.url).searchParams;
      imageUrl = params.get('url');
    } else {
      const body = await req.json();
      imageUrl = body.url;
    }
    
    if (!imageUrl || typeof imageUrl !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Basic URL validation - must be http(s)
    let urlObj: URL;
    try {
      urlObj = new URL(imageUrl);
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid URL' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return new Response(JSON.stringify({ error: 'Only HTTP(S) allowed' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Block private/internal IPs
    const hostname = urlObj.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('10.') || hostname.startsWith('192.168.') || hostname.startsWith('172.')) {
      return new Response(JSON.stringify({ error: 'Internal addresses not allowed' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Let the edge/browser cache camera thumbnails briefly. Adding a unique
    // cache-buster to every thumbnail request created proxy storms when the
    // Intelligence list opened.
    const fetchUrl = imageUrl;

    const imgResp = await fetch(fetchUrl, {
      signal: AbortSignal.timeout(12000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Referer': urlObj.origin + '/',
        'Cache-Control': 'max-age=30',
      },
    });

    if (!imgResp.ok) {
      return new Response(JSON.stringify({ error: `Upstream ${imgResp.status}` }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const contentType = imgResp.headers.get('content-type') || 'image/jpeg';
    const body = await imgResp.arrayBuffer();

    return new Response(body, {
      headers: {
        ...corsHeaders,
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=120',
      },
    });
  } catch (err) {
    console.error('Proxy image error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});