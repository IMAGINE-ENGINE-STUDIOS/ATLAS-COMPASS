# Tile Intelligence — Phase 2

Building on the geofence tool already shipped. Everything below runs without AI by default; AI only fires when the user opens the Insights panel, asks a question, or explicitly enables background prediction on a rule.

## 1. Rules engine (alarms)

New "Bell" button on every saved geofence opens a Rules panel.

Rule shape:
- **Source**: Earth Intelligence layer (temperature, precipitation, wind, AQI, fire, flood), storm feed (NOAA/NWS), lightning (Blitzortung), earthquake (USGS), or a user dataset.
- **Condition**: `>`, `<`, `between`, `enters area`, `exits area`, `rate of change`.
- **Threshold + unit**.
- **Cooldown** (min minutes between triggers).
- **Actions** (multi-select, see §2).
- **AI assist toggle** (off by default) — when on, the chosen model runs a lightweight forecast on each tick and can pre-fire the rule with a confidence score.

Evaluation:
- Edge function `tile-intel-tick` runs on a `pg_cron` every 2 min.
- For each active rule, sample the source over the geofence's tile set / polygon, compare to threshold, respect cooldown, insert a row in `tile_intel_events`, dispatch actions.
- Events also stream to the browser via a Supabase Realtime channel so the Notifications bell and Atlas pins update live.

## 2. Action targets

One `actions` table per user, referenced by rules. Types:
- **In-app notification** (bell + toast + Atlas pin at the geofence centroid)
- **Webhook** — HTTP POST to a user URL with HMAC signature (secret per action)
- **Email** — via existing Resend/Seamless email path
- **SMS** — via the GatewayAPI connector (already documented in knowledge)
- **In-app pipeline step** — chain into another rule (simple fan-out)

Dispatch is handled by `tile-intel-dispatch` edge function; failures are retried up to 3× with backoff and logged to `tile_intel_event_deliveries`.

## 3. User datasets & heatmaps

Upload panel accepts: GeoJSON, KML/KMZ, Shapefile (.zip), CSV with lat/lon, GeoTIFF, NetCDF, GPX, and generic JSON with a mapping step. Also raw model files (`.onnx`, `.pt`, `.pkl`, `.joblib`) stored as opaque blobs the user can reference from a rule.

- Storage: new private bucket `user-datasets`.
- Metadata row in `user_datasets` (kind, bbox, min/max, units, sample count, tile-z hint).
- Conversion runs in edge function `dataset-convert` (shapefile → GeoJSON, GeoTIFF → tiled PNG stats, CSV → indexed points).
- **Heatmap rendering**: WebGL heatmap layer over Cesium using the dataset's points/raster; opacity + palette controls.
- Datasets can be used as a **rule source** (threshold on any numeric field) and streamed as a live layer.

## 4. OSM buildings as intelligence objects

Cesium's OSM Buildings tileset is already loaded. Adding a click-to-select handler:
- Clicked building → pull its OSM `id`, footprint, height from the feature.
- Opens the standard POI card with a new "Make intelligent" action → creates a mini-geofence from the footprint and lets the user attach rules exactly like a drawn area.
- Buildings with active rules render with a colored outline matching the geofence color.

## 5. Streaming in & out

- **In**: an "Ingest" endpoint (`/functions/v1/tile-intel-ingest`) accepts JSON or NDJSON with `{ dataset_id, ts, lat, lon, value, ... }`. Each row flows through the same rule evaluator as scheduled ticks, so a user can push sensor data and get instant alarms. Auth via a per-dataset ingest token.
- **Out**: any rule can flip on "stream firehose" — every event for that rule is also published on a signed WebSocket URL (Supabase Realtime broadcast) and mirrored to the user's webhook if configured. Lets external tools subscribe.

## 6. AI model selection (background, opt-in)

New "AI" tab in the Tile Intelligence panel:
- Pick a model from the Lovable AI catalog (`google/gemini-3-flash-preview` default; `google/gemini-2.5-pro`, `openai/gpt-5-mini`, `openai/gpt-5.5` etc.).
- Choice is stored per user in `profiles.ai_preferences` (jsonb).
- Three surfaces use it, all lazy:
  1. **Ask** — chat box in the Insights panel; sends the current geofence + recent events + selected datasets as context.
  2. **Predict on demand** — "Forecast next 24h" button on any rule; one-shot call.
  3. **Background prediction** — only when the user checks "AI assist" on a specific rule; the tick function calls the model with a strict budget (short prompt, cached recent samples) and stores the forecast in `tile_intel_forecasts`.

No AI runs otherwise — the base intelligence pipeline is deterministic and free.

## Technical section

### Database (one migration)

```
tile_intel_rules      (id, owner_id, geofence_id, name, source_kind, source_ref,
                       condition, threshold jsonb, cooldown_s, ai_assist bool,
                       ai_model text, enabled bool, last_fired_at, ...)
tile_intel_actions    (id, owner_id, kind, config jsonb, secret text)
tile_intel_rule_actions (rule_id, action_id)
tile_intel_events     (id, rule_id, fired_at, sample jsonb, ai_confidence)
tile_intel_event_deliveries (id, event_id, action_id, status, attempts, last_error)
tile_intel_forecasts  (id, rule_id, horizon_s, prediction jsonb, model, created_at)
user_datasets         (id, owner_id, name, kind, bbox, stats jsonb, storage_path,
                       ingest_token, created_at, updated_at)
```

All in `public`, with `GRANT SELECT/INSERT/UPDATE/DELETE … TO authenticated`, `GRANT ALL … TO service_role`, RLS scoped to `auth.uid() = owner_id`, and `touch_updated_at` triggers.

Also add `profiles.ai_preferences jsonb default '{}'` and enable Realtime on `tile_intel_events`.

### Edge functions

- `tile-intel-tick` — pg_cron every 2 min; evaluates enabled rules.
- `tile-intel-dispatch` — action fan-out (in-app / webhook / email / SMS via GatewayAPI).
- `tile-intel-ingest` — external streaming endpoint (per-dataset token).
- `tile-intel-ask` — chat endpoint using the user's selected AI model via Lovable AI Gateway (AI SDK, streaming).
- `dataset-convert` — parses uploaded files into a normalized shape.

### Frontend (all under `src/components/atlas/tileIntel/` and `src/lib/tileIntel/`)

- `RulesPanel.tsx`, `RuleEditor.tsx`, `ActionsLibrary.tsx`, `DatasetsPanel.tsx`, `DatasetUploader.tsx`
- `HeatmapLayer.tsx` (Cesium primitive)
- `OsmBuildingsInteractor.tsx` — click handler + footprint → geofence bridge
- `InsightsPanel.tsx` (Ask + Forecast) + `AiModelPicker.tsx`
- `NotificationsBell.tsx` with Realtime subscription
- Rule/action/dataset persistence in `lib/tileIntel/*.ts`, same pattern as `geofences.ts`

### Order of implementation

1. Migration + RLS + Realtime.
2. Actions library + dispatcher.
3. Rules panel wired to geofences + `tile-intel-tick`.
4. Notifications bell + Atlas event pins.
5. Dataset upload/convert + heatmap layer.
6. OSM buildings selector → geofence bridge.
7. AI model picker + Ask/Forecast + optional background AI on rules.
8. Ingest endpoint + firehose broadcast.

Persistence and caching follow the same pattern as Earth Intelligence and the geofence tool: session cache for freshly loaded rules/datasets, `localStorage` for panel state, DB for the source of truth.
