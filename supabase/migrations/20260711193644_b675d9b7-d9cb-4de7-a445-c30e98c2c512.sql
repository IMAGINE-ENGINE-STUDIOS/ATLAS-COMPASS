
-- Add world scoping to geofences and user_datasets so each planet keeps its own data
ALTER TABLE public.geofences
  ADD COLUMN IF NOT EXISTS world text NOT NULL DEFAULT 'earth';
ALTER TABLE public.geofences
  DROP CONSTRAINT IF EXISTS geofences_world_check;
ALTER TABLE public.geofences
  ADD CONSTRAINT geofences_world_check CHECK (world ~ '^[a-z0-9_-]{1,40}$');
CREATE INDEX IF NOT EXISTS geofences_world_owner_idx ON public.geofences(world, owner_id);

ALTER TABLE public.user_datasets
  ADD COLUMN IF NOT EXISTS world text NOT NULL DEFAULT 'earth';
ALTER TABLE public.user_datasets
  DROP CONSTRAINT IF EXISTS user_datasets_world_check;
ALTER TABLE public.user_datasets
  ADD CONSTRAINT user_datasets_world_check CHECK (world ~ '^[a-z0-9_-]{1,40}$');
CREATE INDEX IF NOT EXISTS user_datasets_world_owner_idx ON public.user_datasets(world, owner_id);
