ALTER TABLE public.atlas_level_placements
  DROP CONSTRAINT IF EXISTS atlas_level_placements_world_check;

ALTER TABLE public.atlas_level_placements
  ADD CONSTRAINT atlas_level_placements_world_check
  CHECK (world ~ '^[a-z0-9_-]{1,40}$');

CREATE INDEX IF NOT EXISTS idx_atlas_level_placements_world_owner
  ON public.atlas_level_placements(world, owner_id);
