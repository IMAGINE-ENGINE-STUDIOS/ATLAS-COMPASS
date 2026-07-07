
-- ============================================================================
-- BUILDING RECORDS (OSM Buildings ledger)
-- ============================================================================
CREATE TABLE public.building_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  osm_id TEXT NOT NULL,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  name TEXT,
  address TEXT,
  building_kind TEXT,
  levels INTEGER,
  footprint_m2 DOUBLE PRECISION,
  est_population INTEGER,
  color TEXT,
  tag TEXT,
  notes TEXT,
  replacement_glb_url TEXT,
  replacement_glb_path TEXT,
  is_hidden BOOLEAN NOT NULL DEFAULT false,
  is_public BOOLEAN NOT NULL DEFAULT false,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, osm_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.building_records TO authenticated;
GRANT SELECT ON public.building_records TO anon;
GRANT ALL ON public.building_records TO service_role;

ALTER TABLE public.building_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner full access to building_records"
  ON public.building_records FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Public building_records readable by anyone"
  ON public.building_records FOR SELECT
  USING (is_public = true);

CREATE INDEX building_records_user_idx ON public.building_records (user_id);
CREATE INDEX building_records_public_idx ON public.building_records (is_public) WHERE is_public = true;
CREATE INDEX building_records_geo_idx ON public.building_records (lat, lng);
CREATE INDEX building_records_osm_idx ON public.building_records (osm_id);

CREATE TRIGGER building_records_touch_updated_at
  BEFORE UPDATE ON public.building_records
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================================
-- BUILDING LEDGER (append-only change log)
-- ============================================================================
CREATE TABLE public.building_ledger (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  record_id UUID NOT NULL REFERENCES public.building_records(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  kind TEXT NOT NULL,
  message TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.building_ledger TO authenticated;
GRANT SELECT ON public.building_ledger TO anon;
GRANT ALL ON public.building_ledger TO service_role;

ALTER TABLE public.building_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages own ledger entries"
  ON public.building_ledger FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Public ledger readable if record is public"
  ON public.building_ledger FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.building_records r
    WHERE r.id = building_ledger.record_id AND r.is_public = true
  ));

CREATE INDEX building_ledger_record_idx
  ON public.building_ledger (record_id, created_at DESC);
