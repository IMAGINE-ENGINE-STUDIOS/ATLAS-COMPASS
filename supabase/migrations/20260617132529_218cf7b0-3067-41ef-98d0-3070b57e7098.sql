
-- LEVELS: user-owned creative scenes
CREATE TABLE public.levels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  name TEXT NOT NULL DEFAULT 'Untitled Level',
  description TEXT,
  thumbnail_url TEXT,
  scene JSONB NOT NULL DEFAULT '{"objects":[],"lights":[],"animations":[],"environment":{"background":"#0b0f1a","ambient":0.4}}'::jsonb,
  is_public BOOLEAN NOT NULL DEFAULT false,
  shared_with UUID[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.levels TO authenticated;
GRANT ALL ON public.levels TO service_role;

ALTER TABLE public.levels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners manage their levels"
  ON public.levels FOR ALL TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "shared users can read"
  ON public.levels FOR SELECT TO authenticated
  USING (auth.uid() = ANY(shared_with) OR is_public = true);

CREATE POLICY "public levels readable by anyone"
  ON public.levels FOR SELECT TO anon
  USING (is_public = true);
GRANT SELECT ON public.levels TO anon;

CREATE INDEX idx_levels_owner ON public.levels(owner_id);

-- ATLAS placements of levels at geo locations
CREATE TABLE public.atlas_level_placements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  level_id UUID NOT NULL REFERENCES public.levels(id) ON DELETE CASCADE,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  altitude DOUBLE PRECISION NOT NULL DEFAULT 0,
  heading DOUBLE PRECISION NOT NULL DEFAULT 0,
  scale DOUBLE PRECISION NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.atlas_level_placements TO authenticated;
GRANT ALL ON public.atlas_level_placements TO service_role;
GRANT SELECT ON public.atlas_level_placements TO anon;

ALTER TABLE public.atlas_level_placements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners manage their placements"
  ON public.atlas_level_placements FOR ALL TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "anyone reads placements of accessible levels"
  ON public.atlas_level_placements FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.levels l
      WHERE l.id = level_id
        AND (l.is_public = true OR l.owner_id = auth.uid() OR auth.uid() = ANY(l.shared_with))
    )
  );

CREATE INDEX idx_placements_level ON public.atlas_level_placements(level_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_levels_updated BEFORE UPDATE ON public.levels
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_placements_updated BEFORE UPDATE ON public.atlas_level_placements
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
