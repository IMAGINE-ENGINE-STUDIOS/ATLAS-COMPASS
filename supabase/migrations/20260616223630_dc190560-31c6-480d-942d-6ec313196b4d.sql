CREATE TABLE IF NOT EXISTS public.camera_catalog (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  image_url TEXT,
  stream_url TEXT,
  source TEXT NOT NULL,
  region TEXT,
  country TEXT,
  refresh_rate INTEGER DEFAULT 30,
  feed_status TEXT DEFAULT 'unverified',
  last_updated TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_camera_catalog_bounds ON public.camera_catalog (lat, lng);
CREATE INDEX IF NOT EXISTS idx_camera_catalog_source ON public.camera_catalog (source);
GRANT SELECT ON public.camera_catalog TO anon;
GRANT SELECT ON public.camera_catalog TO authenticated;
GRANT ALL ON public.camera_catalog TO service_role;
ALTER TABLE public.camera_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read access to cameras"
  ON public.camera_catalog FOR SELECT
  USING (true);