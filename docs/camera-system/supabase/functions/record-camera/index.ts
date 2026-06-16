import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { camera_id, image_url, user_id, session_id } = await req.json();

    if (!camera_id || !image_url || !user_id || !session_id) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Fetch image via proxy-camera-image function
    const proxyUrl = `${supabaseUrl}/functions/v1/proxy-camera-image?url=${encodeURIComponent(image_url)}&_t=${Date.now()}`;
    const imgResp = await fetch(proxyUrl, {
      headers: {
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!imgResp.ok) {
      const errText = await imgResp.text();
      console.error(`[record-camera] Proxy fetch failed: ${imgResp.status} - ${errText}`);
      return new Response(JSON.stringify({ error: `Proxy fetch failed: ${imgResp.status}` }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const blob = await imgResp.arrayBuffer();
    const fileSize = blob.byteLength;
    const ts = Date.now();
    const date = new Date(ts);
    const dateStr = date.toISOString().split('T')[0];
    const storagePath = `${camera_id}/${dateStr}/${ts}.jpg`;

    // Upload to storage
    const { error: uploadErr } = await supabase.storage
      .from('camera-snapshots')
      .upload(storagePath, blob, { contentType: 'image/jpeg', upsert: true });

    if (uploadErr) {
      console.error(`[record-camera] Storage upload failed:`, uploadErr);
      return new Response(JSON.stringify({ error: 'Storage upload failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Insert snapshot record
    await supabase.from('camera_snapshots').insert({
      camera_id,
      user_id,
      captured_at: date.toISOString(),
      storage_path: storagePath,
      file_size: fileSize,
    });

    // Update session stats
    await supabase.rpc('increment_session_stats', {
      p_session_id: session_id,
      p_size_bytes: fileSize,
    });

    // Update storage usage
    await supabase.rpc('increment_storage_usage', {
      p_user_id: user_id,
      p_bytes: fileSize,
    });

    // Update last_capture_at on session
    await supabase
      .from('recording_sessions')
      .update({ last_capture_at: date.toISOString() })
      .eq('id', session_id);

    return new Response(JSON.stringify({ success: true, file_size: fileSize, storage_path: storagePath }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[record-camera] Error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
