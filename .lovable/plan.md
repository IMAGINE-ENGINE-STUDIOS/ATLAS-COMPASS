## Goals

1. Revert the last two visual changes (cloud shell + ocean water/specular). Restore the original clean globe baseline.
2. Upgrade the Atlas search engine by layering **Google Maps Platform** (Places API New + Geocoding) on top of the existing free OSM Overpass + Nominatim pipeline — Google fills gaps, OSM stays as fallback, results are merged and deduped.

## Step 1 — Roll back the planet changes

In `src/pages/SpaceshipPage.tsx`:

- Remove the `viewer.entities.add({ id: "atmospheric-cloud-shell", ... })` block (the translucent NASA-clouds ellipsoid).
- Remove the "Animated ocean water" block: `showWaterEffect`, `oceanNormalMapUrl`, `dynamicAtmosphereLighting*`, the `atmosphereLightIntensity` re-assignment, the `skyAtmosphere.brightnessShift/saturationShift` overrides, and the `viewer.clock.shouldAnimate / multiplier` lines.
- Restore `createWorldTerrainAsync({ requestWaterMask: false, requestVertexNormals: true })` (the water mask is no longer needed and slows tile loads).
- Drop the now-unused `ImageMaterialProperty` import.

Net effect: globe goes back to the exact state before those two requests — no clouds, no animated water shader, no specular changes.

## Step 2 — Wire up Google Maps Platform

Connect the **Google Maps Platform** connector (`google_maps`) via `standard_connectors--connect`. This auto-provisions:

- Server-side gateway access via `LOVABLE_API_KEY` + `GOOGLE_MAPS_API_KEY` (for Places API New, Geocoding, Routes).
- `VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY` for any browser-side Places autocomplete if we want it later.

No user-supplied API key needed — the managed connection works on `*.lovable.app`.

## Step 3 — New edge function: `google-search`

Create `supabase/functions/google-search/index.ts`:

- Inputs: `{ query: string, center?: {lat,lng}, radiusMeters?: number }`.
- Calls Places API (New) **Text Search** through the gateway:
  `POST https://connector-gateway.lovable.dev/google_maps/places/v1/places:searchText`
  with `X-Goog-FieldMask: places.id,places.displayName,places.formattedAddress,places.location,places.types,places.rating,places.userRatingCount,places.websiteUri,places.nationalPhoneNumber,places.primaryType,places.iconMaskBaseUri`
  and `locationBias.circle` when `center` is provided.
- If the query looks like a pure address (no business keyword and Places returns 0), fall back to **Geocoding API** (`/maps/api/geocode/json`) via the same gateway.
- Returns a normalized array shaped like the existing `SearchResult` (id, name, lat, lng, type, address, source: "google").
- Standard headers, Zod input validation, abort-safe.

## Step 4 — Merge into the unified search

In `src/pages/SpaceshipPage.tsx` `runUnifiedSearch`:

```text
runUnifiedSearch(query)
 ├─ runOverpassAround (expanding radii) ──► osm hits
 ├─ runNominatimBounded near + global ───► nominatim hits
 └─ supabase.functions.invoke('google-search', { query, center }) ──► google hits
                                │
                                ▼
                merge → dedupe by (name + ~25m proximity) → rank
```

Ranking changes (only the merge step, existing exact/prefix/contains scoring kept):

1. Exact-name matches first, regardless of source.
2. Then by haversine distance from viewport center.
3. Tie-breaker: Google hits with a `rating ≥ 4.0` win over OSM hits to surface verified businesses faster.
4. Dedupe: if a Google place and an OSM POI share a normalized name and are within ~25 m, keep the Google one (richer metadata) and merge the OSM id for back-compat.

UI: the existing results dropdown stays as-is. Each row gains a tiny source badge — "Google" (subtle white text), nothing for OSM — so the user can tell where a hit came from. Pin colors unchanged.

## Step 5 — Enrich POI cards

When a result has `source: "google"` we already get phone, website, rating, review count, and `iconMaskBaseUri`. Pass these through to `POICard` so the existing fields are populated from Google when present, OSM otherwise — no new card layout.

## Technical details

- All Google calls go through the connector gateway (never direct to `googleapis.com`).
- No browser-side Google calls in this plan — we keep search server-side so we control quotas and field masks.
- Existing free OSM pipeline is **not removed**; Google is additive. If the edge function fails or returns empty, search still works exactly like today.
- New file: `supabase/functions/google-search/index.ts` (auto-deployed by Lovable Cloud).
- Edited file: `src/pages/SpaceshipPage.tsx` (revert globe changes + extend `runUnifiedSearch` + tiny badge in dropdown row).
- Edited file: `src/components/POICard.tsx` (pass through Google fields when present).

No DB migrations, no auth changes, no new npm packages.