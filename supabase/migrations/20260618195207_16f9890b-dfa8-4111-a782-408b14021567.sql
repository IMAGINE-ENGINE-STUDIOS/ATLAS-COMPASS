
CREATE TABLE public.rig_saves (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  source_label TEXT,
  model_url TEXT NOT NULL,
  active_clip TEXT,
  speed REAL NOT NULL DEFAULT 1,
  controller_map JSONB NOT NULL DEFAULT '{}'::jsonb,
  pose JSONB NOT NULL DEFAULT '[]'::jsonb,
  thumbnail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rig_saves TO authenticated;
GRANT ALL ON public.rig_saves TO service_role;

ALTER TABLE public.rig_saves ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own rig saves"
  ON public.rig_saves
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX rig_saves_user_id_created_at_idx
  ON public.rig_saves (user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.touch_rig_saves_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_rig_saves_updated_at
  BEFORE UPDATE ON public.rig_saves
  FOR EACH ROW EXECUTE FUNCTION public.touch_rig_saves_updated_at();
