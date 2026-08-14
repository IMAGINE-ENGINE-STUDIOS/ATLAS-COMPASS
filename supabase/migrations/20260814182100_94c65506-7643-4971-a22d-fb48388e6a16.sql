CREATE TABLE public.world_models (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  name TEXT NOT NULL DEFAULT 'Untitled World',
  description TEXT,
  thumbnail_url TEXT,
  is_public BOOLEAN NOT NULL DEFAULT false,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  weights_ref TEXT,
  source_level_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.world_models TO authenticated;
GRANT SELECT ON public.world_models TO anon;
GRANT ALL ON public.world_models TO service_role;

ALTER TABLE public.world_models ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public worlds are viewable by everyone"
  ON public.world_models FOR SELECT
  USING (is_public = true);

CREATE POLICY "Owners can view their worlds"
  ON public.world_models FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "Owners can create worlds"
  ON public.world_models FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owners can update their worlds"
  ON public.world_models FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owners can delete their worlds"
  ON public.world_models FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_world_models_updated_at
  BEFORE UPDATE ON public.world_models
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX world_models_owner_idx ON public.world_models (owner_id);