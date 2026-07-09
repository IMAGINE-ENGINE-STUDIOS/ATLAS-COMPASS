# Comprehensive Solar Report — from Roof Tool

Turn the roof/solar measurement into a **full solar engineering proposal** on par with what Tesla Solar, Sunrun, Enphase and Aurora Solar produce — powered by real-world irradiance data and exported as a downloadable PDF.

---

## What the report will contain

Every section a solar installer needs to design a system and quote a homeowner.

### 1. Site & Roof
- Address (reverse-geocoded from Nominatim), lat/lng, elevation
- Roof slant area, planar (footprint) area, perimeter, tilt°, azimuth° (derived from vertex order + true north)
- Roof shape thumbnail — direct Cesium canvas capture of the polygon
- Optimal tilt for that latitude (≈ |lat|) — flagged as green/amber/red vs current tilt

### 2. Solar Resource (real data, no fabrication)
- Monthly GHI / DNI / DIF (kWh/m²/day) from **NASA POWER** (free, no key)
- Peak sun hours per month + annual average
- Sun-path summary at summer / equinox / winter solstice (elevation & azimuth at solar noon) via `suncalc`
- Sky-condition context: clearness index if NASA POWER returns it

### 3. System Design
- Panel model selector (Tesla 425 W, REC Alpha Pure 430 W, Q.CELLS Q.PEAK 400 W, Silfab 440 W, LG NeON — user picks default)
- Panels that fit = `floor(slantArea × 0.72 / panelArea)` (72 % usable factor — industry median)
- DC system size (kWp), AC size after inverter clipping, DC:AC ratio
- Inverter recommendation (string vs micro-inverter table)
- String layout guidance (panels/string, strings/MPPT)
- Battery add-on toggle — Tesla Powerwall 3 vs Enphase IQ Battery 10 sizing suggestion based on annual consumption

### 4. Energy Production
- Year-1 annual kWh, monthly production **bar chart** (recharts)
- Panel-plane irradiance from PVGIS (falls back to NASA POWER + tilt correction if PVGIS unavailable)
- 25-year degradation curve (year-1 output, then –0.5 %/yr) — line chart
- Utility-bill offset % (user enters average monthly bill or kWh)

### 5. Financials
- Editable inputs: `$/W installed` (default 2.75), utility rate `$/kWh` (default 0.16), yearly rate escalator (3 %), ITC % (30 %), loan APR / term
- Gross cost, federal ITC credit, net cost
- Simple payback (yrs), 25-year net savings, IRR, LCOE ($/kWh)
- Monthly loan payment vs monthly bill savings (comparison bar)
- Ballpark permitting & interconnection line item

### 6. Environmental Impact
- Lifetime CO₂ avoided (t), equivalent trees planted, gasoline cars off the road, US homes powered — same formulas EPA uses (grid intensity from IEA world avg + optional user override)

### 7. Assumptions & Disclaimers
- Every constant used (fill factor, losses, degradation, grid intensity)
- Data-source attributions: NASA POWER, PVGIS, Nominatim, SunCalc
- "Estimates only — final numbers require a site survey" footer

### 8. Deliverable
- **PDF export** (`jspdf` + `jspdf-autotable`) — multi-page, branded, includes the Cesium screenshot and inline recharts (rendered to PNG via `html-to-image`)
- **Copy shareable summary** to clipboard (markdown)
- **Save to Cloud** — writes report metadata to a new `solar_reports` table so the user can re-open past reports from the Atlas measurement ledger

---

## UX

- New **"Generate Solar Report"** primary CTA appears inside the roof readout block once the polygon has ≥ 3 vertices and the user has clicked "End Measurement".
- Clicking it opens a **draggable full-viewport modal** styled like the Mesh Editor: three-pane layout — left nav (report sections), center preview (live-rendered report with charts), right inputs (panel model, utility rate, financing).
- Real-time recompute as inputs change.
- Footer: `Download PDF` · `Save to Cloud` · `Copy summary` · `Close`.

---

## Technical section

### New files
```text
src/components/atlas/solar-report/
  SolarReportModal.tsx        ← draggable modal, three-pane layout
  SolarReportPreview.tsx      ← center pane, renders every section
  sections/
    SiteSection.tsx
    ResourceSection.tsx
    SystemSection.tsx
    ProductionSection.tsx
    FinancialsSection.tsx
    ImpactSection.tsx
    AssumptionsSection.tsx
  charts/
    MonthlyProductionChart.tsx     ← recharts BarChart
    DegradationChart.tsx           ← recharts LineChart
    SunPathChart.tsx               ← lightweight SVG
  panels/
    PanelCatalog.ts                ← curated panel database (Tesla, REC, Q.CELLS, Silfab, LG, Longi)
    InverterCatalog.ts             ← Enphase IQ8, SolarEdge HD-Wave, Tesla inverter
  api/
    fetchNasaPower.ts              ← https://power.larc.nasa.gov/api/temporal/climatology/point
    fetchPvgis.ts                  ← https://re.jrc.ec.europa.eu/api/v5_2/PVcalc
    reverseGeocode.ts              ← existing Nominatim helper
    sunPosition.ts                 ← suncalc wrapper
  export/
    exportPdf.ts                   ← jsPDF composition
    exportMarkdown.ts              ← clipboard summary
  types.ts                         ← ReportInputs, ReportComputed, ProviderCatalog
```

### Files edited
- `src/components/atlas/MeasureToolPanel.tsx`
  - Add "Generate Solar Report" button inside the `mode === "roof"` readout block (around line 1257).
  - Extract `solarPotential()` into `solar-report/api/solarModel.ts` and enrich it to consume monthly PSH from NASA POWER (fall back to the current lat-band table if the API is unreachable — preserving the offline path but marking the report as "using fallback data").
  - Pass the current `viewer` down so the modal can capture a canvas screenshot.

### New Supabase table (report persistence)
```sql
create table public.solar_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  address text,
  lat double precision not null,
  lng double precision not null,
  inputs jsonb not null,
  computed jsonb not null,
  thumbnail_url text
);
grant select, insert, update, delete on public.solar_reports to authenticated;
grant all on public.solar_reports to service_role;
alter table public.solar_reports enable row level security;
create policy "owner_all" on public.solar_reports
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

### Dependencies to add
- `jspdf`, `jspdf-autotable` — PDF composition
- `html-to-image` — recharts → PNG for embedding in PDF
- `suncalc` — sun elevation/azimuth (tiny, 3 KB)
- `recharts` (check first; if not present, add) — charts

### Data sources (all real, no fabrication — matches project memory rule)
| Data | Endpoint | Auth |
|---|---|---|
| Monthly GHI/DNI/DIF | `https://power.larc.nasa.gov/api/temporal/climatology/point` | none |
| Panel-plane yield | `https://re.jrc.ec.europa.eu/api/v5_2/PVcalc` | none |
| Address | `https://nominatim.openstreetmap.org/reverse` (already used) | none |
| Sun position | `suncalc` npm — computed locally from lat/lng/date | n/a |

If a network fetch fails, the report shows a yellow "using fallback climatology" banner rather than silently making up numbers — no simulated data ever presented as real.

### Files NOT touched
- Cesium viewer setup, Atlas main routes, Mesh Controller, Imagine Engine pages.
- Existing measurement types / ledger persistence — the roof measurement schema is a superset already (`solar` sub-object stays; the report just enriches it with monthly arrays).

### Out of scope (explicit)
- Shading analysis from actual sun-path obstruction (requires ray-cast against 3D tiles — noted in Assumptions as a limitation).
- Per-panel string routing / DC loss modeling — we suggest inverter+string count but don't lay out cabling.
- Live utility-rate lookup — user enters their rate (or we default to 0.16 $/kWh with a note).
