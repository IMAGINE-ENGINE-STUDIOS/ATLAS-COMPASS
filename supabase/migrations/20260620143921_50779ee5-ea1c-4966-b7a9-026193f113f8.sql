ALTER TABLE public.atlas_level_placements
  ADD COLUMN IF NOT EXISTS terrain_expand_feet real NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS surrounding_terrain jsonb;