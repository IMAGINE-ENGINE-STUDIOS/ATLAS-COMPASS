
-- =====================================================================
-- disaster_events
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.disaster_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  hazard_type TEXT NOT NULL,
  severity SMALLINT NOT NULL DEFAULT 1,
  magnitude NUMERIC(5,2),
  title TEXT NOT NULL,
  summary TEXT,
  lat DOUBLE PRECISION,
  lon DOUBLE PRECISION,
  region TEXT,
  country TEXT,
  event_time TIMESTAMPTZ NOT NULL,
  url TEXT,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  dispatched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT disaster_events_source_ext_uniq UNIQUE (source, external_id)
);

CREATE INDEX IF NOT EXISTS disaster_events_event_time_idx ON public.disaster_events (event_time DESC);
CREATE INDEX IF NOT EXISTS disaster_events_hazard_severity_idx ON public.disaster_events (hazard_type, severity, event_time DESC);
CREATE INDEX IF NOT EXISTS disaster_events_undispatched_idx ON public.disaster_events (dispatched_at) WHERE dispatched_at IS NULL;
CREATE INDEX IF NOT EXISTS disaster_events_geo_idx ON public.disaster_events (lat, lon);

GRANT SELECT ON public.disaster_events TO anon, authenticated;
GRANT ALL ON public.disaster_events TO service_role;

ALTER TABLE public.disaster_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view disaster events"
  ON public.disaster_events FOR SELECT USING (true);

CREATE TRIGGER touch_disaster_events_updated_at
  BEFORE UPDATE ON public.disaster_events
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.disaster_events;

-- =====================================================================
-- user_alert_subscriptions
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.user_alert_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hazard_types TEXT[] NOT NULL DEFAULT ARRAY['earthquake','tsunami','weather','wildfire','volcano','incident']::text[],
  min_severity SMALLINT NOT NULL DEFAULT 3,
  min_magnitude NUMERIC(5,2) NOT NULL DEFAULT 6.0,
  geofences JSONB NOT NULL DEFAULT '[]'::jsonb,
  worldwide BOOLEAN NOT NULL DEFAULT true,
  channels TEXT[] NOT NULL DEFAULT ARRAY['in_app','email']::text[],
  phone_e164 TEXT,
  quiet_hours_start SMALLINT,
  quiet_hours_end SMALLINT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_alert_subs_user_uniq UNIQUE (user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_alert_subscriptions TO authenticated;
GRANT ALL ON public.user_alert_subscriptions TO service_role;

ALTER TABLE public.user_alert_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subscription"
  ON public.user_alert_subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own subscription"
  ON public.user_alert_subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own subscription"
  ON public.user_alert_subscriptions FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own subscription"
  ON public.user_alert_subscriptions FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER touch_user_alert_subs_updated_at
  BEFORE UPDATE ON public.user_alert_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =====================================================================
-- alert_notifications
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.alert_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.disaster_events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  attempt_count SMALLINT NOT NULL DEFAULT 0,
  error TEXT,
  read_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT alert_notifications_unique_send UNIQUE (event_id, user_id, channel)
);

CREATE INDEX IF NOT EXISTS alert_notifications_user_created_idx ON public.alert_notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS alert_notifications_status_idx ON public.alert_notifications (status);

GRANT SELECT, UPDATE ON public.alert_notifications TO authenticated;
GRANT ALL ON public.alert_notifications TO service_role;

ALTER TABLE public.alert_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
  ON public.alert_notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can mark own notifications read"
  ON public.alert_notifications FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER touch_alert_notifications_updated_at
  BEFORE UPDATE ON public.alert_notifications
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.alert_notifications;

-- =====================================================================
-- feed_heartbeats
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.feed_heartbeats (
  source TEXT PRIMARY KEY,
  last_run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_event_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  status TEXT NOT NULL DEFAULT 'ok',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.feed_heartbeats TO authenticated;
GRANT ALL ON public.feed_heartbeats TO service_role;

ALTER TABLE public.feed_heartbeats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Atlas admins can view feed heartbeats"
  ON public.feed_heartbeats FOR SELECT USING (public.has_role(auth.uid(), 'atlas_admin'));

CREATE TRIGGER touch_feed_heartbeats_updated_at
  BEFORE UPDATE ON public.feed_heartbeats
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.feed_heartbeats (source, status) VALUES
  ('usgs-quakes','ok'),
  ('noaa-weather','ok'),
  ('noaa-tsunami','ok'),
  ('nasa-firms','ok'),
  ('gdacs','ok'),
  ('smithsonian-volcanoes','ok'),
  ('gdelt-incidents','ok'),
  ('alert-dispatcher','ok')
ON CONFLICT (source) DO NOTHING;

-- =====================================================================
-- admin_alert_settings
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.admin_alert_settings (
  id INT PRIMARY KEY DEFAULT 1,
  emails TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
  phones_e164 TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
  min_severity SMALLINT NOT NULL DEFAULT 4,
  min_magnitude NUMERIC(5,2) NOT NULL DEFAULT 6.0,
  channels TEXT[] NOT NULL DEFAULT ARRAY['email']::text[],
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT admin_alert_settings_singleton CHECK (id = 1)
);

INSERT INTO public.admin_alert_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

GRANT SELECT ON public.admin_alert_settings TO authenticated;
GRANT ALL ON public.admin_alert_settings TO service_role;

ALTER TABLE public.admin_alert_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Atlas admins can view admin alert settings"
  ON public.admin_alert_settings FOR SELECT USING (public.has_role(auth.uid(), 'atlas_admin'));
CREATE POLICY "Atlas admins can update admin alert settings"
  ON public.admin_alert_settings FOR UPDATE USING (public.has_role(auth.uid(), 'atlas_admin')) WITH CHECK (public.has_role(auth.uid(), 'atlas_admin'));

CREATE TRIGGER touch_admin_alert_settings_updated_at
  BEFORE UPDATE ON public.admin_alert_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =====================================================================
-- web_push_subscriptions
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.web_push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS web_push_subs_user_idx ON public.web_push_subscriptions (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.web_push_subscriptions TO authenticated;
GRANT ALL ON public.web_push_subscriptions TO service_role;

ALTER TABLE public.web_push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own push subscriptions"
  ON public.web_push_subscriptions FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER touch_web_push_subs_updated_at
  BEFORE UPDATE ON public.web_push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
