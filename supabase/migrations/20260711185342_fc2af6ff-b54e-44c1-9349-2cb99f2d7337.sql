ALTER TABLE public.splat_landmarks
  ADD COLUMN IF NOT EXISTS world TEXT NOT NULL DEFAULT 'earth';

ALTER TABLE public.splat_landmarks
  DROP CONSTRAINT IF EXISTS splat_landmarks_world_check;

ALTER TABLE public.splat_landmarks
  ADD CONSTRAINT splat_landmarks_world_check
  CHECK (world ~ '^[a-z0-9_-]{1,40}$');

CREATE INDEX IF NOT EXISTS idx_splat_landmarks_world_owner
  ON public.splat_landmarks(world, owner_id);
