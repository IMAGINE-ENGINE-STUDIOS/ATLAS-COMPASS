CREATE OR REPLACE FUNCTION public.claim_atlas_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_exists BOOLEAN;
  caller UUID;
BEGIN
  caller := auth.uid();
  IF caller IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'atlas_admin') INTO admin_exists;
  IF admin_exists THEN
    RETURN false;
  END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (caller, 'atlas_admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_atlas_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_atlas_admin() TO authenticated;