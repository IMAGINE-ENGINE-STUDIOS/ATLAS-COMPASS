## Why nothing is indexed

The sync function is parsing cameras correctly (FI-Digitraffic 2,242; NY-511 2,921; ES-Madrid 357; MD-ArcGIS 451; LA-ArcGIS 435; ES-Catalonia 159…) but **every upsert fails** with:

> `Could not find the 'last_seen_at' column of 'camera_catalog' in the schema cache`

`sync-cameras` writes a `last_seen_at` timestamp on every row, but the `camera_catalog` table only has `last_updated`. PostgREST rejects the whole batch, so 0 rows land in the DB — which is why Intelligence shows nothing.

A second smaller issue: the function also upserts into `camera_sync_status`, which doesn't exist in the schema at all.

## Fix

1. **Migration — align the schema with what the sync code writes:**
   - Add `last_seen_at timestamptz default now()` to `public.camera_catalog`.
   - Backfill `last_seen_at = coalesce(last_updated, now())` so existing rows are valid.
   - Add a helpful index on `(source, last_seen_at desc)` for freshness queries.
   - Create `public.camera_sync_status` (per-source health):
     - `source_name text primary key`, `last_sync_at timestamptz`, `last_success_at timestamptz`, `last_error text`, `camera_count int`, `sync_duration_ms int`.
   - Add the standard GRANTs on both tables (service_role full, authenticated read; anon read on `camera_catalog` only — Intelligence is a public read layer; `camera_sync_status` stays auth-only).
   - Enable RLS and add a `SELECT using (true)` policy on `camera_catalog` (already exists) and a service-role-only policy on `camera_sync_status`.

2. **No code changes needed** in `sync-cameras` or `traffic-cameras` — once the columns exist, the existing upserts and reads work as written. After the migration runs, the user clicks **Sync** in the Intelligence panel and the catalog fills with ~6–10k cameras across all working sources. (Note: many state DOT and EU endpoints currently return 0 cameras — that's an upstream availability issue, not a code bug. The ~200k figure assumes every upstream source is reachable; in practice expect a few thousand to tens of thousands depending on which endpoints respond.)

3. **Verification after migration approval:**
   - Trigger one sync run, then `select source, count(*) from camera_catalog group by source order by 2 desc` to confirm rows landed.
   - Reopen Intelligence — pins should populate around the viewport.

### Technical details

```sql
ALTER TABLE public.camera_catalog
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now();
UPDATE public.camera_catalog SET last_seen_at = COALESCE(last_updated, now())
  WHERE last_seen_at IS NULL;
CREATE INDEX IF NOT EXISTS camera_catalog_source_seen_idx
  ON public.camera_catalog (source, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS public.camera_sync_status (
  source_name text PRIMARY KEY,
  last_sync_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  camera_count int,
  sync_duration_ms int,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.camera_sync_status TO authenticated;
GRANT ALL    ON public.camera_sync_status TO service_role;
ALTER TABLE public.camera_sync_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role manages sync status"
  ON public.camera_sync_status FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "authenticated reads sync status"
  ON public.camera_sync_status FOR SELECT TO authenticated USING (true);
```

Approve to apply the migration; cameras will populate on the next Sync.