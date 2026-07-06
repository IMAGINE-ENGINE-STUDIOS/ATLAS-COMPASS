
-- AI preference on profile
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ai_preferences jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ============ user_datasets ============
CREATE TABLE public.user_datasets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL, -- geojson|kml|shp|csv|geotiff|netcdf|gpx|json|model
  bbox jsonb,
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  storage_path text,
  ingest_token text NOT NULL DEFAULT encode(gen_random_bytes(24),'hex'),
  sample_count integer NOT NULL DEFAULT 0,
  units text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_datasets TO authenticated;
GRANT ALL ON public.user_datasets TO service_role;
ALTER TABLE public.user_datasets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own datasets" ON public.user_datasets FOR ALL
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE INDEX ON public.user_datasets(owner_id, created_at DESC);
CREATE TRIGGER trg_user_datasets_touch BEFORE UPDATE ON public.user_datasets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ tile_intel_actions ============
CREATE TABLE public.tile_intel_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL, -- in_app|webhook|email|sms|pipeline
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  secret text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tile_intel_actions TO authenticated;
GRANT ALL ON public.tile_intel_actions TO service_role;
ALTER TABLE public.tile_intel_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own actions" ON public.tile_intel_actions FOR ALL
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE INDEX ON public.tile_intel_actions(owner_id, created_at DESC);
CREATE TRIGGER trg_actions_touch BEFORE UPDATE ON public.tile_intel_actions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ tile_intel_rules ============
CREATE TABLE public.tile_intel_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  geofence_id uuid REFERENCES public.geofences(id) ON DELETE CASCADE,
  name text NOT NULL,
  source_kind text NOT NULL, -- earth_layer|storm|lightning|earthquake|dataset|osm_building
  source_ref jsonb NOT NULL DEFAULT '{}'::jsonb, -- {layer:'temp'} | {dataset_id:'..'} | {osm_id:'..'}
  condition text NOT NULL, -- gt|lt|between|enters|exits|roc
  threshold jsonb NOT NULL DEFAULT '{}'::jsonb,
  cooldown_s integer NOT NULL DEFAULT 300,
  ai_assist boolean NOT NULL DEFAULT false,
  ai_model text,
  firehose boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT true,
  last_fired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tile_intel_rules TO authenticated;
GRANT ALL ON public.tile_intel_rules TO service_role;
ALTER TABLE public.tile_intel_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own rules" ON public.tile_intel_rules FOR ALL
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE INDEX ON public.tile_intel_rules(owner_id, enabled);
CREATE INDEX ON public.tile_intel_rules(geofence_id);
CREATE TRIGGER trg_rules_touch BEFORE UPDATE ON public.tile_intel_rules
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ tile_intel_rule_actions ============
CREATE TABLE public.tile_intel_rule_actions (
  rule_id uuid NOT NULL REFERENCES public.tile_intel_rules(id) ON DELETE CASCADE,
  action_id uuid NOT NULL REFERENCES public.tile_intel_actions(id) ON DELETE CASCADE,
  PRIMARY KEY (rule_id, action_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tile_intel_rule_actions TO authenticated;
GRANT ALL ON public.tile_intel_rule_actions TO service_role;
ALTER TABLE public.tile_intel_rule_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own rule_actions" ON public.tile_intel_rule_actions FOR ALL
  USING (EXISTS (SELECT 1 FROM public.tile_intel_rules r WHERE r.id = rule_id AND r.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.tile_intel_rules r WHERE r.id = rule_id AND r.owner_id = auth.uid()));

-- ============ tile_intel_events ============
CREATE TABLE public.tile_intel_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rule_id uuid NOT NULL REFERENCES public.tile_intel_rules(id) ON DELETE CASCADE,
  fired_at timestamptz NOT NULL DEFAULT now(),
  sample jsonb NOT NULL DEFAULT '{}'::jsonb,
  ai_confidence numeric,
  read_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tile_intel_events TO authenticated;
GRANT ALL ON public.tile_intel_events TO service_role;
ALTER TABLE public.tile_intel_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own events" ON public.tile_intel_events FOR ALL
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE INDEX ON public.tile_intel_events(owner_id, fired_at DESC);
CREATE INDEX ON public.tile_intel_events(rule_id, fired_at DESC);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.tile_intel_events;

-- ============ tile_intel_event_deliveries ============
CREATE TABLE public.tile_intel_event_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.tile_intel_events(id) ON DELETE CASCADE,
  action_id uuid NOT NULL REFERENCES public.tile_intel_actions(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending', -- pending|success|failed
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tile_intel_event_deliveries TO authenticated;
GRANT ALL ON public.tile_intel_event_deliveries TO service_role;
ALTER TABLE public.tile_intel_event_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own deliveries" ON public.tile_intel_event_deliveries FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.tile_intel_events e WHERE e.id = event_id AND e.owner_id = auth.uid()));
CREATE INDEX ON public.tile_intel_event_deliveries(event_id);
CREATE TRIGGER trg_deliveries_touch BEFORE UPDATE ON public.tile_intel_event_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ tile_intel_forecasts ============
CREATE TABLE public.tile_intel_forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rule_id uuid NOT NULL REFERENCES public.tile_intel_rules(id) ON DELETE CASCADE,
  horizon_s integer NOT NULL,
  prediction jsonb NOT NULL DEFAULT '{}'::jsonb,
  model text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tile_intel_forecasts TO authenticated;
GRANT ALL ON public.tile_intel_forecasts TO service_role;
ALTER TABLE public.tile_intel_forecasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own forecasts" ON public.tile_intel_forecasts FOR ALL
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE INDEX ON public.tile_intel_forecasts(rule_id, created_at DESC);
