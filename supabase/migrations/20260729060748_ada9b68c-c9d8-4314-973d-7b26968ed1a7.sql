CREATE TABLE public.sms_subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_e164 text NOT NULL UNIQUE,
  username text UNIQUE,
  language text NOT NULL DEFAULT 'en',
  hazards text[] NOT NULL DEFAULT '{}',
  pending_hazards text[] NOT NULL DEFAULT '{}',
  city text,
  region text,
  country text,
  country_code text,
  lat double precision,
  lon double precision,
  precise_location boolean NOT NULL DEFAULT false,
  radius_km integer NOT NULL DEFAULT 300,
  state text NOT NULL DEFAULT 'new',
  min_severity integer NOT NULL DEFAULT 3,
  consent_at timestamptz,
  stopped_at timestamptz,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sms_subscribers_active ON public.sms_subscribers (state) WHERE state = 'active';
CREATE INDEX idx_sms_subscribers_geo ON public.sms_subscribers (lat, lon);

GRANT ALL ON public.sms_subscribers TO service_role;
ALTER TABLE public.sms_subscribers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sms_subscribers_service_only" ON public.sms_subscribers FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.sms_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_sid text UNIQUE,
  from_phone text NOT NULL,
  to_phone text,
  body text,
  channel text NOT NULL DEFAULT 'sms',
  detected_language text,
  matched_hazards text[] NOT NULL DEFAULT '{}',
  reply_sent text,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sms_inbox_from ON public.sms_inbox (from_phone, received_at DESC);

GRANT ALL ON public.sms_inbox TO service_role;
ALTER TABLE public.sms_inbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sms_inbox_service_only" ON public.sms_inbox FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.sms_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  to_phone text NOT NULL,
  body text NOT NULL,
  channel text NOT NULL DEFAULT 'sms',
  event_id text,
  hazard_type text,
  severity integer,
  message_sid text,
  status text NOT NULL DEFAULT 'queued',
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_sms_outbox_dedupe ON public.sms_outbox (to_phone, event_id) WHERE event_id IS NOT NULL;
CREATE INDEX idx_sms_outbox_created ON public.sms_outbox (created_at DESC);

GRANT ALL ON public.sms_outbox TO service_role;
ALTER TABLE public.sms_outbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sms_outbox_service_only" ON public.sms_outbox FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.sms_location_tokens (
  token text PRIMARY KEY,
  phone_e164 text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sms_location_tokens_phone ON public.sms_location_tokens (phone_e164);

GRANT ALL ON public.sms_location_tokens TO service_role;
ALTER TABLE public.sms_location_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sms_location_tokens_service_only" ON public.sms_location_tokens FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.hazard_keywords (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hazard text NOT NULL,
  lang text NOT NULL,
  lang_name text,
  keyword text NOT NULL,
  normalized text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_hazard_keywords_unique ON public.hazard_keywords (normalized, hazard);
CREATE INDEX idx_hazard_keywords_lang ON public.hazard_keywords (lang);

GRANT SELECT ON public.hazard_keywords TO anon, authenticated;
GRANT ALL ON public.hazard_keywords TO service_role;
ALTER TABLE public.hazard_keywords ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hazard_keywords_public_read" ON public.hazard_keywords FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "hazard_keywords_service_write" ON public.hazard_keywords FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER trg_sms_subscribers_touch
  BEFORE UPDATE ON public.sms_subscribers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();