CREATE TABLE public.level_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level_id uuid NOT NULL REFERENCES public.levels(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  name text NOT NULL DEFAULT 'Untitled Level',
  description text,
  is_public boolean NOT NULL DEFAULT false,
  scene jsonb NOT NULL,
  client_saved_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.level_snapshots TO authenticated;
GRANT ALL ON public.level_snapshots TO service_role;

ALTER TABLE public.level_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can read their level snapshots"
ON public.level_snapshots
FOR SELECT
TO authenticated
USING (auth.uid() = owner_id);

CREATE POLICY "Owners can append level snapshots"
ON public.level_snapshots
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = owner_id
  AND EXISTS (
    SELECT 1
    FROM public.levels l
    WHERE l.id = level_snapshots.level_id
      AND l.owner_id = auth.uid()
  )
);

CREATE INDEX level_snapshots_level_created_idx
ON public.level_snapshots (level_id, created_at DESC);