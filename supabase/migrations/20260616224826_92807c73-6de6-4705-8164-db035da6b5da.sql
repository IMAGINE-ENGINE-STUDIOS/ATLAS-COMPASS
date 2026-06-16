ALTER TABLE public.camera_catalog
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now();

UPDATE public.camera_catalog
   SET last_seen_at = COALESCE(last_updated, now())
 WHERE last_seen_at IS NULL;

CREATE INDEX IF NOT EXISTS camera_catalog_source_seen_idx
  ON public.camera_catalog (source, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS public.camera_sync_status (
  source_name      text PRIMARY KEY,
  last_sync_at     timestamptz,
  last_success_at  timestamptz,
  last_error       text,
  camera_count     int,
  sync_duration_ms int,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT                         ON public.camera_sync_status TO authenticated;
GRANT ALL                            ON public.camera_sync_status TO service_role;

ALTER TABLE public.camera_sync_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service role manages sync status"  ON public.camera_sync_status;
DROP POLICY IF EXISTS "authenticated reads sync status"   ON public.camera_sync_status;

CREATE POLICY "service role manages sync status"
  ON public.camera_sync_status FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "authenticated reads sync status"
  ON public.camera_sync_status FOR SELECT TO authenticated
  USING (true);
