
## Goal

Add a third map type **"Google 3D (Direct)"** next to *Realistic* and *OSM* in the bottom-right HUD switcher, sourcing tiles **directly from Google's Map Tiles API** instead of through Cesium Ion. Make it the new default load.

## Why this is the "ultra-realistic" feed

Google publishes one Photorealistic 3D Tiles dataset — the same mesh that powers Google Earth, AR experiences, and the Unity/Unreal "Geospatial Creator" plugins. There is no hidden higher-detail tier. The win over what you have today is the **delivery path**:

| | Current (Ion) | New (Direct) |
|---|---|---|
| Host | `assets.ion.cesium.com` | `tile.googleapis.com/v1/3dtiles` |
| Freshness | Re-hosted; lags Google by days/weeks | Live mesh as Google publishes |
| Quota | Subject to Ion's bandwidth cap | Subject to Google's connector quota |
| Attribution | Cesium credit | Google logo + dynamic per-tile copyright string (ToS-required) |

## Plan

### 1. Edge-function tile proxy

`tile.googleapis.com` is **not** on the connector gateway's host allowlist, and the managed Google Maps browser key is not authorized for Map Tiles. So tiles have to go through an edge function that injects the connector key server-side.

Create `supabase/functions/google-3d-tiles/index.ts`:
- Accepts `GET /functions/v1/google-3d-tiles/{...path}?session=...`
- Forwards to `https://tile.googleapis.com/v1/3dtiles/{path}` adding `key=GOOGLE_MAPS_API_KEY`
- Streams the response back with `Cache-Control: public, max-age=86400` and CORS headers
- Rewrites JSON tile manifests so child URIs point back to the function (so Cesium follows them through the proxy, not direct to Google)
- Rate-limits to one outgoing request per (path+session) at a time with a small in-memory dedupe map

### 2. Load the tileset in `SpaceshipPage.tsx`

Inside the existing Cesium init block (after the current Ion `fromIonAssetId(2275207)` call):

```ts
const FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-3d-tiles`;
Cesium3DTileset.fromUrl(`${FN}/root.json`, {
  showCreditsOnScreen: false,  // we render our own pill
}).then(ts => {
  (viewer as any)._googleDirectTileset = ts;
  ts.show = true;  // becomes the default visible layer
  // hide the Ion-routed one
  const ion = (viewer as any)._realisticTileset; if (ion) ion.show = false;
  viewer.scene.primitives.add(ts);
  // wire the same play-mode SSE/cache settings the other tilesets get
});
```

Apply the same play-mode tuning (`cacheBytes 4GiB`, `immediatelyLoadDesiredLevelOfDetail`, `loadSiblings`, `preloadAncestors/Siblings`) that's already applied to `_realisticTileset`.

### 3. HUD switcher

Extend the `switchViewMode` callback and the button row at line ~6444:

```text
[ Google 3D ]  [ Realistic ]  [ OSM ]
   green          cyan          orange
```

- `viewMode` union becomes `"google" | "realistic" | "osm"`.
- Default `useState<"google">("google")`.
- New green-tinted button with a `Globe` lucide icon, sits to the left of Realistic.
- `switchViewMode("google")` shows `_googleDirectTileset`, hides Ion + OSM, hides globe.

### 4. Custom attribution pill

Mount a `<GoogleAttributionPill />` absolute-positioned just above the GlassPanel that holds the mode buttons (bottom-right). It renders:

- The official Google logo PNG (white-on-transparent, downloaded once into `src/assets/`).
- A dynamic copyright string read every ~500ms from `tileset.credits` (Cesium's credit collection) — Google ships per-region attribution (e.g. *"©2025 Google, Airbus, Maxar Technologies"*) and ToS requires it to be visible.
- Only shows when `viewMode === "google"`.

### 5. Cleanup on unmount / mode switch

Add `_googleDirectTileset` to the existing `useEffect` cleanup arrays at lines 3806-3807 and 765-770 so its caches/timers participate in the same play-mode lifecycle.

## Technical notes (file-by-file)

| File | Change |
|---|---|
| `supabase/functions/google-3d-tiles/index.ts` | NEW. Proxies Map Tiles API using `GOOGLE_MAPS_API_KEY`. Streams + rewrites manifest child URIs. |
| `supabase/config.toml` | Add `[functions.google-3d-tiles] verify_jwt = false` so Cesium can fetch tiles without a user JWT. |
| `src/pages/SpaceshipPage.tsx` | Add Google-direct tileset load; expand `viewMode` union to include `"google"` (default); extend `switchViewMode`; add the new HUD button. |
| `src/components/atlas/GoogleAttributionPill.tsx` | NEW. Logo + dynamic credit text, shown only in Google mode. |
| `src/assets/google-on-non-white.png` | NEW. Official Google logo for attribution. |

## Out of scope

- No DB migration.
- No change to OSM or Ion routes — they stay as fallbacks.
- No Street View integration (that's a separate API and doesn't return 3D mesh; can be added later).

## Risks / open questions

- The Google Maps connector key must have the **Map Tiles API** enabled in the underlying Google Cloud project. If the Lovable-managed connection doesn't include it, the first proxied call will return `REQUEST_DENIED` and we'll fall back to the Ion route automatically. I'll add a one-shot health probe on load and surface a console warning so we know.
- Per Google ToS, no tile bytes may be cached on disk beyond 30 days. Our in-memory + browser HTTP cache stays well under that; we won't add a persistent IDB cache for these tiles.
