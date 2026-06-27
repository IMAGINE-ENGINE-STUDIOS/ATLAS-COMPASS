## Goal
Make Atlas Intelligence load nearby live cameras without freezing the browser or overloading the computer.

## What I found
- The camera database has data and New York queries return cameras.
- The current panel requests up to 800 cameras per page and can fetch 2 pages for a viewport.
- Opening Intelligence then renders up to 500 Cesium camera billboards and runs `sampleHeightMostDetailed` for every pin, which can force 3D tile loading and stall the main scene.
- The list also creates proxied thumbnail image requests for many visible rows, adding extra network/backend load.
- The database query is much faster when returning a smaller, ordered subset instead of broad pages sorted by id.

## Fix plan
1. **Make camera fetches lightweight**
   - Change `traffic-cameras` to return only fields the UI needs.
   - Hard-cap requested limits server-side to a small safe number.
   - Order by nearby/map-friendly coordinates instead of broad id sorting.

2. **Render fewer pins immediately**
   - Reduce the live Intelligence map pin cap from 500 to a small visible batch.
   - Add the rest progressively only if needed, instead of blocking the first frame.

3. **Stop mass high-detail terrain sampling**
   - Remove `sampleHeightMostDetailed` from Intelligence pins.
   - Use Cesium height references for camera pins first, with optional cheap sampling only for selected/nearby pins.

4. **Prevent thumbnail overload**
   - Only show thumbnails for the first small batch in the panel.
   - Use placeholders for the rest until selected or scrolled into view.
   - Add safer caching to the proxy so repeated images do not hammer the backend.

5. **Make sync non-blocking**
   - Keep Sync manual.
   - Add stronger UI guards so pressing Sync cannot launch repeated expensive operations.
   - Keep viewport reload separate from upstream sync.

6. **Validate**
   - Test the traffic camera function against a New York viewport.
   - Open Intelligence in Atlas and verify cameras appear without tab freeze.
   - Check logs/network for repeated camera proxy storms or function errors.

## Files likely affected
- `src/components/atlas/IntelligencePanel.tsx`
- `src/pages/SpaceshipPage.tsx`
- `supabase/functions/traffic-cameras/index.ts`
- `supabase/functions/proxy-camera-image/index.ts`