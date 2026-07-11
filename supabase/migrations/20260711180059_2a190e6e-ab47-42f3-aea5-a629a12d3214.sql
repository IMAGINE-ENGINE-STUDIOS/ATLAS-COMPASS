ALTER TABLE public.atlas_level_placements
  ADD COLUMN IF NOT EXISTS world TEXT NOT NULL DEFAULT 'earth' CHECK (world IN ('earth', 'moon'));

UPDATE public.atlas_level_placements
SET world = 'earth'
WHERE world IS NULL;

CREATE INDEX IF NOT EXISTS idx_atlas_level_placements_world
  ON public.atlas_level_placements(world);