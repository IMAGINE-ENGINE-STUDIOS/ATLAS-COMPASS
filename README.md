# ATLAS — Global Command Center

![ATLAS — Global Command Center](docs/media/screenshot.jpg)

By [Imagine Engine Studios Corp](https://www.imagineengine.space)

ATLAS is a real-time 3D command center for supply, demand, delivery and disaster
response. It combines a photoreal planetary globe, tectonic and geophysical data,
live hazard feeds and an operations dashboard in a single workbench.

## Highlights

- **Atlas** — CesiumJS globe with realistic imagery, solar-system navigation, POIs,
  routing, logistics tracking and tile intelligence.
- **Geo Realm** — volumetric tectonic plates (NNR-MORVEL 2010 Euler poles), PB2002
  boundaries, CRUST1.0 layer stack, Slab2 subduction geometry, seismic sections and
  tomography indicators.
- **HOT** — live hazard feed aggregating USGS, NASA EONET, GDACS, ReliefWeb and
  NOAA/NWS, with warning broadcasts and push notifications.
- **Alerts** — email and SMS warning system with a 100+ language hazard keyword
  dictionary and proximity-based broadcasting.
- **Levels** — 3D scene design tools with splines, face painting, lighting and
  snap-to-grid.

## Tech stack

React 18 · Vite · TypeScript · Tailwind CSS · CesiumJS · React Three Fiber ·
Supabase (Postgres, Auth, Storage, Edge Functions)

## Getting started

```bash
bun install
bun run dev
```

The app runs at `http://localhost:8080`.

## Build

```bash
bun run build
```

## Backend functions

Serverless edge functions live in `supabase/functions/` (shared helpers in `_shared/`):

| Function | Purpose |
| --- | --- |
| `earthquake-data` | USGS seismic feed ingestion |
| `hot-news` | Aggregates USGS, NASA EONET, GDACS, ReliefWeb and NOAA/NWS hazard feeds |
| `hot-status` | Health and latency status for every hazard source |
| `lightning-data` | Real-time lightning strike feed |
| `quake-report-ai` | AI situation reports for seismic events |
| `emergency-ai-tips` | AI-generated emergency guidance |
| `population-lookup` | Population exposure lookup for an area |
| `solar-ephemeris` | Solar-system body positions for the globe |
| `gis-proxy` | CORS-safe proxy for external GIS/WMS services |
| `google-3d-tiles` | Photorealistic 3D tiles session broker |
| `google-search` | Search backend for place and content lookup |
| `sms-webhook` | Inbound SMS state machine (subscribe, location, STOP/HELP/STATUS) |
| `sms-broadcast` | Proximity-targeted multilingual SMS warnings |
| `sms-location` | GPS location capture from the `/loc/:token` link |
| `seed-hazard-keywords` | Seeds the multilingual hazard keyword dictionary |
| `send-transactional-email` | Sends alert and transactional emails |
| `preview-transactional-email` | Renders email templates for preview |
| `process-email-queue` | Drains the outbound email queue |
| `handle-email-suppression` | Processes bounces and complaints |
| `handle-email-unsubscribe` | Handles unsubscribe links |
| `tile-intel-ask` | Q&A over tile intelligence data |
| `tile-intel-dispatch` | Dispatches tile intelligence jobs |
| `tile-intel-ingest` | Ingests tile datasets and indicators |
| `tile-intel-pipeline` | Tile intelligence processing pipeline |
| `tile-intel-tick` | Scheduled tile intelligence worker |
| `aps-convert` | Autodesk APS CAD conversion |
| `dwg-convert` | DWG conversion pipeline |
| `usd-convert` | USD/USDZ asset conversion |
| `dataset-convert` | Subsurface dataset conversion (SEG-Y, NetCDF) |
| `traffic-cameras` | Traffic camera catalog access |
| `sync-cameras` | Syncs camera inventories |
| `proxy-camera-image` | Proxies camera image frames |
| `lpr-recognize` | License plate recognition requests |
| `lpr-webhook` | Inbound LPR provider webhook |
| `lpr-history` | LPR read history queries |
| `lpr-admin` | LPR administration and tier management |
| `uber-direct` | Uber Direct delivery quotes and dispatch |
| `matchmaking-tick` | Realtime matchmaking worker |

## License

Released under the [MIT License](LICENSE) — Copyright (c) 2026 Imagine Engine Studios Corp.

Website: [www.imagineengine.space](https://www.imagineengine.space)
