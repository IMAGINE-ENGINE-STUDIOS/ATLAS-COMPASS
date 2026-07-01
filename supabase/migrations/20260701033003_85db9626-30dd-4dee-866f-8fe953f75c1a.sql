
CREATE TABLE IF NOT EXISTS public.resources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  content TEXT,
  category TEXT,
  tags TEXT[],
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_featured BOOLEAN NOT NULL DEFAULT false,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  is_emergency BOOLEAN NOT NULL DEFAULT false,
  confirmations_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT ON public.resources TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resources TO authenticated;
GRANT ALL ON public.resources TO service_role;

ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view resources"
  ON public.resources FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create resources"
  ON public.resources FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Authors can update their resources"
  ON public.resources FOR UPDATE TO authenticated
  USING (auth.uid() = author_id) WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Authors can delete their resources"
  ON public.resources FOR DELETE TO authenticated
  USING (auth.uid() = author_id);

CREATE INDEX IF NOT EXISTS idx_resources_is_emergency
  ON public.resources(is_emergency) WHERE is_emergency = true;

CREATE TRIGGER update_resources_updated_at
  BEFORE UPDATE ON public.resources
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Auto-verify emergency resources on insert
CREATE OR REPLACE FUNCTION public.auto_verify_emergency_resource()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_emergency = true THEN
    NEW.is_verified := true;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.auto_verify_emergency_resource() FROM PUBLIC;

CREATE TRIGGER trg_auto_verify_emergency_resource
  BEFORE INSERT ON public.resources
  FOR EACH ROW EXECUTE FUNCTION public.auto_verify_emergency_resource();

-- Confirm emergency RPC
CREATE OR REPLACE FUNCTION public.confirm_emergency_resource(_resource_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_count INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;
  UPDATE public.resources
    SET confirmations_count = COALESCE(confirmations_count, 0) + 1
    WHERE id = _resource_id AND is_emergency = true
    RETURNING confirmations_count INTO new_count;
  RETURN COALESCE(new_count, 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.confirm_emergency_resource(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_emergency_resource(UUID) TO authenticated;
