
-- ═══════════════════════════════════════════════════════════════════
-- Building Selection Groups
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE public.building_selection_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#38bdf8',
  osm_ids TEXT[] NOT NULL DEFAULT '{}'::text[],
  tag TEXT,
  notes TEXT,
  is_public BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX building_selection_groups_user_idx ON public.building_selection_groups(user_id);
CREATE INDEX building_selection_groups_public_idx ON public.building_selection_groups(is_public) WHERE is_public = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.building_selection_groups TO authenticated;
GRANT SELECT ON public.building_selection_groups TO anon;
GRANT ALL ON public.building_selection_groups TO service_role;

ALTER TABLE public.building_selection_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner full access to selection groups"
  ON public.building_selection_groups FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Anyone can view public selection groups"
  ON public.building_selection_groups FOR SELECT
  USING (is_public = true);

CREATE TRIGGER touch_building_selection_groups
  BEFORE UPDATE ON public.building_selection_groups
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ═══════════════════════════════════════════════════════════════════
-- Population Lookup Cache
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE public.population_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cell_key TEXT NOT NULL UNIQUE,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  residents_per_km2 DOUBLE PRECISION,
  source TEXT NOT NULL,
  note TEXT,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  fetched_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX population_cache_cell_idx ON public.population_cache(cell_key);
CREATE INDEX population_cache_fetched_idx ON public.population_cache(fetched_at DESC);

GRANT SELECT ON public.population_cache TO anon, authenticated;
GRANT ALL ON public.population_cache TO service_role;

ALTER TABLE public.population_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read population cache"
  ON public.population_cache FOR SELECT USING (true);
