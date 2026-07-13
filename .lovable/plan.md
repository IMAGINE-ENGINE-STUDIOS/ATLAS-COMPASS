## Goal

On `/dashboard`, add two new sections:

1. **Feed Health Monitor** — live status for USGS, NASA EONET, GDACS, ReliefWeb, NOAA/NWS. Shows OK / Delayed / Down, last successful poll, latency, and item count per source.
2. **Disaster Operations** — top warnings, currently active emergencies, catastrophe ledger, and per-hazard indicators (earthquake, flood, wildfire, storm, volcano, hurricane, tornado, heat, drought, other).

Both hook into the existing HOT pipeline — no simulated data.

## What the user sees

Two new panels on the admin dashboard, above the existing "Live Activity" block:

```text
┌─────────── Feed Health ──────────────────────────────────┐
│  USGS     ● OK     42ms   updated 3s ago   18 items      │
│  NOAA/NWS ● OK    118ms   updated 4s ago   25 items      │
│  GDACS    ◐ Delay  —      updated 4m ago   12 items      │
│  EONET    ● OK    210ms   updated 2s ago   20 items      │
│  Relief   ● Down   —      last ok 12m ago   0 items      │
└──────────────────────────────────────────────────────────┘

┌───── Top Warnings ─────────┐ ┌──── Active Emergencies ────┐
│ ⚠ M6.8 Peru — USGS   Sev 5 │ │ 7 open · 2 escalating       │
│ ⚠ Tornado Warning OK NWS 5 │ │ list of live events         │
│ ⚠ Red Cyclone GDACS   5    │ │                             │
└────────────────────────────┘ └─────────────────────────────┘

┌── Hazard Indicators (last 24h) ────────────────────────────┐
│ 🜨 Quake 34   🌊 Flood 8   🔥 Fire 12   🌀 Hurricane 2      │
│ 🌪 Tornado 4  🌋 Volcano 1  ⚡ Storm 19  ☀ Heat 6  ⋯       │
└────────────────────────────────────────────────────────────┘

┌── Catastrophe Ledger ──────────────────────────────────────┐
│ time · agency · hazard · severity · region · link          │
└────────────────────────────────────────────────────────────┘
```

Auto-refreshes every 5s using the already-cached `hot-news` edge function (10s TTL), so upstream APIs stay protected.

## Data model

- **Feed health** — new edge function `hot-status` returns per-source `{status: "ok"|"delayed"|"down", latency_ms, last_success_iso, item_count, http_status}`. Uses the same `safeFetch` pattern but with a 4s timeout per source, run in parallel. Result is cached in-memory 10s.
  - `ok` = 2xx within 5s
  - `delayed` = 2xx but > 5s, or cache >5min stale
  - `down` = non-2xx / timeout / network error
- **Top warnings / active emergencies / hazard indicators / ledger** — derived on the client from:
  - `hot-news` edge function (already returns unified `Broadcast[]` including `kind`, `hazard_type`, `severity`, `event_time`, `agency`, `source_url`)
  - `disaster_events` table (already has `hazard_type`, `severity`, `magnitude`, `event_time`, `region`, `country`)
  - `sos_posts` table filtered to `kind='warning'` and unresolved
- No schema changes required.

## Technical details

- New file `supabase/functions/hot-status/index.ts` — pings each source's cheapest endpoint (USGS 1-hour feed, EONET `/events?limit=1`, GDACS RSS HEAD, ReliefWeb `?limit=1`, NOAA `/alerts/active?limit=1`) in parallel with `AbortController` 4s timeout, records latency, caches result 10s. Returns `{sources: [...], generated_at}`. Uses `verify_jwt` default.
- New component `src/components/dashboard/FeedHealthCard.tsx` — polls `hot-status` every 5s, renders 5-row list with colored dot (success/warning/destructive tokens), tabular-nums latency, relative time.
- New component `src/components/dashboard/DisasterOpsSection.tsx` — polls `hot-news` every 5s and reads `disaster_events` + `sos_posts` warnings once + realtime subscription. Renders:
  - **Top Warnings** list (`kind === 'warning'` sorted by severity desc, top 6)
  - **Active Emergencies** count + list from `sos_posts` where `kind='warning'` and `resolved_at IS NULL` (fallback: recent severity ≥ 4)
  - **Hazard Indicators** grid — count by `hazard_type` over the last 24h, one tile per category with lucide icon (Waves, Flame, Wind, Mountain, Zap, Sun, CloudRain, Snowflake)
  - **Catastrophe Ledger** — scrollable list of the last 30 broadcasts + `disaster_events` merged, newest first, with agency chip, severity dot, region, "open source" link.
- Wire both into `src/pages/DashboardPage.tsx` as a new section directly under the `HeroHeader`, above the stats grid, behind an `EditorialDivider label="Global Hazard Watch"`.
- Follow existing dashboard styling (`GlassCard`, `PageContainer`, `AnimatedSection`, semantic tokens `success` / `warning` / `destructive`). Uses framer-motion already imported on that page.

## Out of scope

- No changes to the HOT portal UI.
- No new tables; no changes to RLS.
- No push-notification changes.
- No auth/role gating change (dashboard already lives behind `AppLayout`).
