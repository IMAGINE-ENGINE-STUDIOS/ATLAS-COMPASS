# Real-Time Camera System — Export Package

Drop-in package for adding real-time traffic camera support to another Lovable/Supabase app.

## Contents

```
sql/schema.sql                              -> camera_catalog table + RLS + grants
types/camera.ts                             -> TrafficCamera TS interface
hooks/useTrafficCameras.ts                  -> map-bounds fetch + accumulative merge
hooks/useCameraTimeline.ts                  -> recorded-snapshots timeline scrubber
components/TrafficCameraPopup.tsx           -> popup UI (live img/video + record)
components/CameraVideoPlayer.tsx            -> MJPEG/HLS/MP4 stream detector + player
components/CameraTimelineScrubber.tsx       -> historical scrubber
components/CameraHistoryControls.tsx        -> play/pause/seek controls
supabase/functions/traffic-cameras/         -> map-bounds query (paginated)
supabase/functions/proxy-camera-image/      -> CORS proxy + cache-busting
supabase/functions/sync-cameras/            -> ingest from FL511/Caltrans/NYC/VA/OH/TN/CO/511 v2/ArcGIS
supabase/functions/record-camera/           -> snapshot recorder -> storage
```

## Install (in target project)

1. Run `sql/schema.sql` as a Supabase migration.
2. Copy `supabase/functions/*` into `supabase/functions/` (auto-deploys).
3. Copy `types/camera.ts`, `hooks/*` and `components/*` into your `src/` tree, fixing imports:
   - `@/integrations/supabase/client`
   - shadcn UI components used by the popup (Button, Dialog, Slider, etc.)
   - lucide-react icons
4. Optional storage bucket for `record-camera`:
   ```sql
   INSERT INTO storage.buckets (id, name, public) VALUES ('camera-recordings','camera-recordings', true);
   ```
5. Run `sync-cameras` once (or on a cron) to populate `camera_catalog`.

## Data flow

```
map moveend  ->  useTrafficCameras  ->  supabase.functions.invoke('traffic-cameras', { bounds, cursor })
                                            -> SELECT from camera_catalog WHERE lat/lng in bounds (paginated)
camera img   ->  proxy-camera-image  ->  fetch upstream + add CORS + cache-bust headers
ingestion    ->  sync-cameras        ->  upsert from public 511/ArcGIS APIs
recording    ->  record-camera       ->  store snapshots in storage bucket
```

## Stream detection (`CameraVideoPlayer.tsx`)

```ts
function isStreamUrl(url?: string): boolean {
  if (!url) return false;
  if (/\.(mjpg|mjpeg|mp4|m3u8)(\?|$)/i.test(url)) return true;
  if (/mjpeg|mjpg|\.stream|hls|playlist\.m3u/i.test(url)) return true;
  return false;
}
```

## Notes

- All edge functions ship with `verify_jwt = false` and validate inputs internally.
- `useTrafficCameras` merges accumulatively — never clears cameras during pan/zoom.
- Image refresh is cache-busted with `?t=<timestamp>` at `refreshRate` seconds.
