
CREATE TABLE public.geofences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#38bdf8',
  zoom INTEGER NOT NULL DEFAULT 16,
  tile_set JSONB NOT NULL DEFAULT '[]'::jsonb,
  polygon JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.geofences TO authenticated;
GRANT ALL ON public.geofences TO service_role;

ALTER TABLE public.geofences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their geofences"
  ON public.geofences FOR ALL
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE INDEX geofences_owner_idx ON public.geofences(owner_id, created_at DESC);

CREATE TRIGGER geofences_touch_updated_at
  BEFORE UPDATE ON public.geofences
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
