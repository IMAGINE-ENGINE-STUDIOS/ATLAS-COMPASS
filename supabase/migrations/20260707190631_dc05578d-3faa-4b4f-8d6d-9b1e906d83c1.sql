-- ============================================================
-- 1. Roles infrastructure
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('atlas_admin', 'moderator', 'user');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_roles_self_read" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "user_roles_admin_read_all" ON public.user_roles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'atlas_admin'));

CREATE POLICY "user_roles_admin_write" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'atlas_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'atlas_admin'));

-- ============================================================
-- 2. Per-user LPR settings
-- ============================================================
CREATE TABLE public.lpr_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  access_mode TEXT NOT NULL DEFAULT 'byok' CHECK (access_mode IN ('admin','platform','byok')),
  legal_ack_at TIMESTAMPTZ,
  byok_api_key TEXT,
  platform_approved BOOLEAN NOT NULL DEFAULT false,
  webhook_secret TEXT NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  daily_request_cap INT NOT NULL DEFAULT 1000,
  requests_today INT NOT NULL DEFAULT 0,
  requests_reset_at DATE NOT NULL DEFAULT current_date,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.lpr_settings TO authenticated;
GRANT ALL ON public.lpr_settings TO service_role;
ALTER TABLE public.lpr_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lpr_settings_self_all" ON public.lpr_settings
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "lpr_settings_admin_read" ON public.lpr_settings
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'atlas_admin'));

CREATE POLICY "lpr_settings_admin_write" ON public.lpr_settings
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'atlas_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'atlas_admin'));

CREATE TRIGGER lpr_settings_touch BEFORE UPDATE ON public.lpr_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================
-- 3. Access requests for platform-provided key
-- ============================================================
CREATE TABLE public.lpr_access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requester_name TEXT NOT NULL,
  organization TEXT,
  contact_email TEXT NOT NULL,
  purpose TEXT NOT NULL,
  jurisdictions TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','revoked')),
  admin_notes TEXT,
  decided_at TIMESTAMPTZ,
  decided_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.lpr_access_requests TO authenticated;
GRANT ALL ON public.lpr_access_requests TO service_role;
ALTER TABLE public.lpr_access_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lpr_access_self_insert" ON public.lpr_access_requests
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "lpr_access_self_read" ON public.lpr_access_requests
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "lpr_access_admin_read" ON public.lpr_access_requests
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'atlas_admin'));

CREATE POLICY "lpr_access_admin_update" ON public.lpr_access_requests
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'atlas_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'atlas_admin'));

CREATE TRIGGER lpr_access_requests_touch BEFORE UPDATE ON public.lpr_access_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================
-- 4. Cameras
-- ============================================================
CREATE TABLE public.lpr_cameras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'manual_upload' CHECK (kind IN ('network','user_ip','manual_upload')),
  agent_uid TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  rtsp_url TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  last_seen_at TIMESTAMPTZ,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, agent_uid)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lpr_cameras TO authenticated;
GRANT ALL ON public.lpr_cameras TO service_role;
ALTER TABLE public.lpr_cameras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lpr_cameras_self_all" ON public.lpr_cameras
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "lpr_cameras_admin_all" ON public.lpr_cameras
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'atlas_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'atlas_admin'));

CREATE TRIGGER lpr_cameras_touch BEFORE UPDATE ON public.lpr_cameras
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================
-- 5. Plate reads
-- ============================================================
CREATE TABLE public.lpr_plate_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  camera_id UUID REFERENCES public.lpr_cameras(id) ON DELETE SET NULL,
  plate TEXT NOT NULL,
  confidence DOUBLE PRECISION,
  region TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  epoch_ms BIGINT NOT NULL,
  vehicle_make TEXT,
  vehicle_model TEXT,
  vehicle_color TEXT,
  vehicle_year TEXT,
  vehicle_body TEXT,
  image_url TEXT,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX lpr_plate_reads_user_time_idx ON public.lpr_plate_reads (user_id, epoch_ms DESC);
CREATE INDEX lpr_plate_reads_plate_idx ON public.lpr_plate_reads (user_id, plate, epoch_ms DESC);

GRANT SELECT, INSERT, DELETE ON public.lpr_plate_reads TO authenticated;
GRANT ALL ON public.lpr_plate_reads TO service_role;
ALTER TABLE public.lpr_plate_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lpr_reads_self_read" ON public.lpr_plate_reads
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "lpr_reads_self_insert" ON public.lpr_plate_reads
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "lpr_reads_self_delete" ON public.lpr_plate_reads
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "lpr_reads_admin_read" ON public.lpr_plate_reads
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'atlas_admin'));

ALTER PUBLICATION supabase_realtime ADD TABLE public.lpr_plate_reads;

-- ============================================================
-- 6. Watchlist
-- ============================================================
CREATE TABLE public.lpr_watchlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plate TEXT NOT NULL,
  label TEXT,
  notify BOOLEAN NOT NULL DEFAULT true,
  color TEXT NOT NULL DEFAULT '#ef4444',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, plate)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lpr_watchlist TO authenticated;
GRANT ALL ON public.lpr_watchlist TO service_role;
ALTER TABLE public.lpr_watchlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lpr_watchlist_self_all" ON public.lpr_watchlist
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "lpr_watchlist_admin_read" ON public.lpr_watchlist
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'atlas_admin'));

-- ============================================================
-- 7. Geofence hits
-- ============================================================
CREATE TABLE public.lpr_geofence_hits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  geofence_id UUID REFERENCES public.geofences(id) ON DELETE SET NULL,
  read_id UUID REFERENCES public.lpr_plate_reads(id) ON DELETE CASCADE,
  plate TEXT NOT NULL,
  hit_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX lpr_geofence_hits_user_time_idx ON public.lpr_geofence_hits (user_id, hit_at DESC);

GRANT SELECT, UPDATE, DELETE ON public.lpr_geofence_hits TO authenticated;
GRANT ALL ON public.lpr_geofence_hits TO service_role;
ALTER TABLE public.lpr_geofence_hits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lpr_hits_self_read" ON public.lpr_geofence_hits
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "lpr_hits_self_update" ON public.lpr_geofence_hits
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "lpr_hits_self_delete" ON public.lpr_geofence_hits
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "lpr_hits_admin_read" ON public.lpr_geofence_hits
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'atlas_admin'));

ALTER PUBLICATION supabase_realtime ADD TABLE public.lpr_geofence_hits;

-- ============================================================
-- 8. Geofences: add LPR alert flag
-- ============================================================
ALTER TABLE public.geofences
  ADD COLUMN IF NOT EXISTS lpr_alert BOOLEAN NOT NULL DEFAULT false;