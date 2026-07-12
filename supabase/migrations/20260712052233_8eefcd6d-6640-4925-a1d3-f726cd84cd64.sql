
CREATE TABLE public.geo_realm_bundles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('plates','faults','slab','crust','seismic','tomography','bathymetry','cad','custom')),
  description TEXT,
  bbox JSONB,
  depth_range JSONB,
  source_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  layers JSONB NOT NULL DEFAULT '[]'::jsonb,
  manifest_url TEXT,
  thumbnail_url TEXT,
  is_public BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.geo_realm_bundles TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.geo_realm_bundles TO authenticated;
GRANT ALL ON public.geo_realm_bundles TO service_role;

ALTER TABLE public.geo_realm_bundles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public bundles viewable by all"
  ON public.geo_realm_bundles FOR SELECT
  USING (is_public = true OR auth.uid() = owner_id);

CREATE POLICY "Users insert own bundles"
  ON public.geo_realm_bundles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users update own bundles"
  ON public.geo_realm_bundles FOR UPDATE TO authenticated
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users delete own bundles"
  ON public.geo_realm_bundles FOR DELETE TO authenticated
  USING (auth.uid() = owner_id);

CREATE INDEX geo_realm_bundles_owner_idx ON public.geo_realm_bundles(owner_id);
CREATE INDEX geo_realm_bundles_kind_idx ON public.geo_realm_bundles(kind);
CREATE INDEX geo_realm_bundles_public_idx ON public.geo_realm_bundles(is_public) WHERE is_public = true;

CREATE TRIGGER geo_realm_bundles_touch
  BEFORE UPDATE ON public.geo_realm_bundles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
