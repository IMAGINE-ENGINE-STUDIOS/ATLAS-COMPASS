---
name: Camera System Package (stored)
description: Real-time traffic camera package archived at docs/camera-system/ — components, hooks, SQL schema, and edge functions ready to wire into Atlas later.
type: reference
---
Location: `docs/camera-system/`

Contents:
- `components/` — CameraHistoryControls, CameraTimelineScrubber, CameraVideoPlayer, TrafficCameraPopup (.tsx)
- `hooks/` — useCameraTimeline, useTrafficCameras
- `types/camera.ts`
- `sql/schema.sql` — DB schema for camera + recording tables
- `supabase/functions/` — `proxy-camera-image`, `record-camera`, `sync-cameras`, `traffic-cameras` edge functions
- `README.md` — integration notes

Not yet wired into the app. To integrate: move components/hooks/types under `src/`, run the SQL via a new migration (mind GRANTs + RLS), and deploy the edge functions. Stored outside `src/` so it doesn't affect the build until activated.