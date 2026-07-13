
# Reliable Multi-Hazard Warning System

## Coverage (v1)
- **Earthquakes** — USGS FDSN (`all_hour`, `significant_week`) + EMSC-CSEM fallback
- **Tsunamis** — NOAA NTWC/PTWC bulletins
- **Severe weather / floods / hurricanes / tornadoes** — NOAA NWS `api.weather.gov/alerts/active` + GDACS + Copernicus GloFAS
- **Wildfires** — NASA FIRMS (VIIRS 24h)
- **Volcanoes** — Smithsonian GVP weekly + USGS VHP
- **All-hazard aggregator** — GDACS (catches everything above + drought, industrial)
- **Localized incidents ("collapsing building in NY")** — GDELT 2.0 event stream filtered to disaster categories + USGS "Did You Feel It" reports. This is our safety net for one-off events no scientific feed publishes.

Default earthquake threshold M6; tunable per user.

## Architecture
```text
┌─ pollers (cron / 60s) ─┐   ┌─ dedup + normalize ─┐   ┌─ match subscriptions ─┐   ┌─ fan-out ─────────┐
│ usgs-quakes            │   │ disaster_events     │   │ user_alert_subs       │   │ in-app (realtime)  │
│ noaa-weather-alerts    │──▶│ (source,ext_id)     │──▶│ + admin firehose      │──▶│ email (Lovable)    │
│ nasa-firms-fires       │   │ severity, geom,     │   │ geofence match        │   │ sms (Twilio)       │
│ gdacs-global           │   │ magnitude, ts       │   │ min severity          │   │ whatsapp (Twilio)  │
│ smithsonian-volcanoes  │   │                     │   │ quiet hours           │   │ web push           │
│ noaa-tsunami           │   └─────────────────────┘   └───────────────────────┘   └────────────────────┘
│ gdelt-incidents        │              │
└────────────────────────┘              ▼
                                heartbeat + watchdog
```

## Database (one migration)
- `disaster_events` — normalized event store. Cols: `id`, `source`, `external_id` (unique together), `hazard_type`, `severity` (1-5), `magnitude` (nullable), `title`, `summary`, `lat`, `lon`, `region`, `country`, `event_time`, `raw` (jsonb), `updated_at`. Public read; service role write.
- `user_alert_subscriptions` — per-user rules. Cols: `user_id`, `hazard_types[]`, `min_severity`, `min_magnitude`, `geofences` (jsonb: `[{lat,lon,radius_km,label}]`), `channels[]` (`in_app`,`email`,`sms`,`whatsapp`,`push`), `phone_e164`, `quiet_hours_start/end`, `enabled`. Owner-only RLS.
- `alert_notifications` — per-recipient delivery log with idempotency key `(event_id, user_id, channel)`. Owner read + service role write.
- `feed_heartbeats` — one row per poller, `updated_at` + last event count. Admin read.
- `admin_alert_settings` — global firehose recipients + min severity for admin channel.
- `web_push_subscriptions` — browser push endpoints per user.

## Edge functions
- `ingest-usgs-quakes`, `ingest-noaa-weather`, `ingest-nasa-firms`, `ingest-gdacs`, `ingest-smithsonian-volcanoes`, `ingest-noaa-tsunami`, `ingest-gdelt-incidents` — each polls, normalizes, upserts into `disaster_events` on `(source, external_id)` conflict, writes heartbeat.
- `alert-dispatcher` — trigger on new/updated `disaster_events` rows (pg_net cron every 30s reads unprocessed), matches subscriptions, writes to `alert_notifications` with idempotency, invokes `send-transactional-email`, calls Twilio for SMS/WhatsApp, pushes web push. Realtime channel already delivers in-app.
- `feed-watchdog` — alerts admin if any heartbeat > 5min stale.

## Scheduling
`pg_cron` jobs:
- Quakes/weather/tsunami/incidents: every 1 min
- Fires/volcanoes: every 5 min
- GDACS: every 2 min
- Dispatcher: every 30s
- Watchdog: every 5 min

## Frontend
- **`/alerts`** — live feed (Realtime subscription) of all events matching user's subscriptions, filter bar, severity color coding, map view + list view toggle.
- **`/alerts/:id`** — one-pager: title, severity badge, epicenter/impact map, magnitude, felt-population estimate, time-to-impact, nearest cities, tsunami risk, source citations, "notify me of aftershocks" button.
- **`/alerts/:id/report`** — extensive report: AI-generated situation summary (Lovable AI Gateway, no key needed), aftershock live feed, historical context ("6th M6+ in this region this year"), USGS PAGER loss estimate when present, NOAA bulletin text, evacuation resources from existing `resources` table nearby, auto-refresh.
- **`/settings/alerts`** — subscription UI: hazard checkboxes, severity slider, magnitude slider, geofence picker (reuses your Atlas map + POI patterns — click to add radius zones), channel toggles with phone number field, quiet hours, test-send buttons per channel.
- **Global** — bell icon in top nav with unread badge + toast for high-severity events (M6+, severity 4+).

## Email templates (Lovable Emails)
- `disaster-alert-one-pager` — subject `⚠ M{mag} {hazard} near {region} · {relative_time}`. Body: badge, key facts table, static map image, one-pager link, report link, unsubscribe (auto-appended).
- `disaster-report-daily` — optional daily digest of events below individual threshold.

## Reliability guarantees
- **Dedup**: `(source, external_id)` unique; cross-source dedup for quakes via `(round(lat,1), round(lon,1), floor(event_time/60s))` bucket.
- **Idempotency**: `alert_notifications (event_id, user_id, channel)` unique — dispatcher can safely re-run.
- **Retry**: Lovable Emails queue handles email retries + DLQ. Dispatcher marks notification `status` (`queued`, `sent`, `failed`) with `attempt_count`; retries up to 5×.
- **Heartbeat + watchdog**: any silent feed pages admin within 5min.
- **Suppression**: honors existing `suppressed_emails` table automatically via Lovable Emails.

## Secrets needed
- **Twilio** — I'll walk you through connecting the Twilio connector for SMS + WhatsApp (uses their sandbox for WhatsApp initially; production WhatsApp needs Meta business verification which I'll flag).
- **NASA FIRMS MAP_KEY** — free, I'll request it.
- **GDELT, USGS, NOAA, GDACS, Smithsonian** — no keys required.
- Web push VAPID keys — auto-generated via `generate_secret`.

## Build order (single continuous build)
1. Database migration (all tables + RLS + grants + heartbeat seeds).
2. Set up Lovable Emails infrastructure (domain + queue + scaffold transactional).
3. Ingestion edge functions (7 pollers).
4. Dispatcher + watchdog edge functions.
5. Twilio connector link + FIRMS/VAPID secret requests.
6. `pg_cron` schedule inserts.
7. Email template.
8. Frontend: `/alerts`, `/alerts/:id`, `/alerts/:id/report`, `/settings/alerts`, global bell + toast.
9. Web push service worker + subscription flow.
10. Smoke test: force a synthetic M6 event through the pipeline end-to-end.

## Out of scope for v1 (call out for later)
- Native mobile push (Apple/Android APNs/FCM) — web push covers PWA installs.
- Predictive/AI forecasting (only reporting confirmed events).
- Direct siren/PA integrations.
- Paid feeds (USGS ShakeAlert requires licensing for early-warning use in critical apps).
