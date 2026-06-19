CREATE TABLE public.geometries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_public BOOLEAN NOT NULL DEFAULT false,
  csv_content TEXT NOT NULL,
  shape_count INTEGER NOT NULL DEFAULT 0,
  thumbnail_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.geometries TO authenticated;
GRANT SELECT ON public.geometries TO anon;
GRANT ALL ON public.geometries TO service_role;

ALTER TABLE public.geometries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public geometries visible to everyone"
  ON public.geometries FOR SELECT
  USING (is_public = true OR owner_id = auth.uid());

CREATE POLICY "Users insert their own geometries"
  ON public.geometries FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users update their own geometries"
  ON public.geometries FOR UPDATE
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users delete their own geometries"
  ON public.geometries FOR DELETE
  USING (owner_id = auth.uid());

CREATE TRIGGER geometries_touch_updated_at
  BEFORE UPDATE ON public.geometries
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX geometries_public_idx ON public.geometries(is_public, created_at DESC);
CREATE INDEX geometries_owner_idx ON public.geometries(owner_id, created_at DESC);