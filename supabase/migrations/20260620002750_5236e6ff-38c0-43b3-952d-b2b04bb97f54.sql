
CREATE TABLE public.dynamic_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  tags text[] NOT NULL DEFAULT '{}',
  is_public boolean NOT NULL DEFAULT false,
  thumbnail_url text,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.dynamic_objects TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dynamic_objects TO authenticated;
GRANT ALL ON public.dynamic_objects TO service_role;

ALTER TABLE public.dynamic_objects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view public dynamic objects"
  ON public.dynamic_objects
  FOR SELECT
  USING (is_public = true OR owner_id = auth.uid());

CREATE POLICY "Users can insert their own dynamic objects"
  ON public.dynamic_objects
  FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update their own dynamic objects"
  ON public.dynamic_objects
  FOR UPDATE
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can delete their own dynamic objects"
  ON public.dynamic_objects
  FOR DELETE
  USING (auth.uid() = owner_id);

CREATE TRIGGER dynamic_objects_touch_updated_at
  BEFORE UPDATE ON public.dynamic_objects
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX dynamic_objects_owner_idx ON public.dynamic_objects(owner_id);
CREATE INDEX dynamic_objects_public_idx ON public.dynamic_objects(is_public) WHERE is_public = true;
