CREATE TABLE public.signal_pricing_config (
  id integer PRIMARY KEY DEFAULT 1,
  markup_multiplier numeric NOT NULL DEFAULT 2.0,
  floor_usd_per_segment numeric NOT NULL DEFAULT 0.02,
  credit_usd_value numeric NOT NULL DEFAULT 0.01,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT signal_pricing_config_singleton CHECK (id = 1)
);
GRANT SELECT ON public.signal_pricing_config TO anon, authenticated;
GRANT ALL ON public.signal_pricing_config TO service_role;
ALTER TABLE public.signal_pricing_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pricing config readable by all" ON public.signal_pricing_config FOR SELECT USING (true);
CREATE POLICY "admins manage pricing config" ON public.signal_pricing_config FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'atlas_admin')) WITH CHECK (public.has_role(auth.uid(),'atlas_admin'));
CREATE TRIGGER trg_signal_pricing_config_touch BEFORE UPDATE ON public.signal_pricing_config
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.signal_pricing_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_iso text NOT NULL,
  country_name text NOT NULL,
  channel text NOT NULL DEFAULT 'sms_outbound',
  cost_usd_per_segment numeric NOT NULL,
  sell_usd_per_segment numeric NOT NULL,
  effective_from timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX signal_pricing_rates_unique ON public.signal_pricing_rates (country_iso, channel);
GRANT SELECT ON public.signal_pricing_rates TO anon, authenticated;
GRANT ALL ON public.signal_pricing_rates TO service_role;
ALTER TABLE public.signal_pricing_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rate card readable by all" ON public.signal_pricing_rates FOR SELECT USING (true);
CREATE POLICY "admins manage rate card" ON public.signal_pricing_rates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'atlas_admin')) WITH CHECK (public.has_role(auth.uid(),'atlas_admin'));
CREATE TRIGGER trg_signal_pricing_rates_touch BEFORE UPDATE ON public.signal_pricing_rates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.signal_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL UNIQUE,
  company_name text,
  contact_email text,
  balance_credits bigint NOT NULL DEFAULT 0,
  lifetime_purchased_credits bigint NOT NULL DEFAULT 0,
  lifetime_spent_credits bigint NOT NULL DEFAULT 0,
  low_balance_threshold bigint NOT NULL DEFAULT 500,
  auto_topup_enabled boolean NOT NULL DEFAULT false,
  auto_topup_pack text,
  country_allowlist text[] NOT NULL DEFAULT '{}',
  rate_limit_per_second integer NOT NULL DEFAULT 10,
  rate_limit_per_day integer NOT NULL DEFAULT 5000,
  trial_spend_cap_usd numeric NOT NULL DEFAULT 50,
  status text NOT NULL DEFAULT 'active',
  suspended_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.signal_accounts TO authenticated;
GRANT ALL ON public.signal_accounts TO service_role;
ALTER TABLE public.signal_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own account read" ON public.signal_accounts FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(),'atlas_admin'));
CREATE POLICY "own account create" ON public.signal_accounts FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());
CREATE POLICY "own account update" ON public.signal_accounts FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(),'atlas_admin'))
  WITH CHECK (owner_id = auth.uid() OR public.has_role(auth.uid(),'atlas_admin'));
CREATE TRIGGER trg_signal_accounts_touch BEFORE UPDATE ON public.signal_accounts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.signal_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.signal_accounts(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  name text NOT NULL,
  mode text NOT NULL DEFAULT 'live',
  prefix text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  last_four text NOT NULL,
  last_used_at timestamptz,
  revoked_at timestamptz,
  paused boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX signal_api_keys_account ON public.signal_api_keys(account_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.signal_api_keys TO authenticated;
GRANT ALL ON public.signal_api_keys TO service_role;
ALTER TABLE public.signal_api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own keys" ON public.signal_api_keys FOR ALL TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(),'atlas_admin'))
  WITH CHECK (owner_id = auth.uid());
CREATE TRIGGER trg_signal_api_keys_touch BEFORE UPDATE ON public.signal_api_keys
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.signal_credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.signal_accounts(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  kind text NOT NULL,
  credits bigint NOT NULL,
  balance_after bigint NOT NULL,
  usd_amount numeric,
  reference text,
  message_id uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX signal_credit_tx_account ON public.signal_credit_transactions(account_id, created_at DESC);
GRANT SELECT ON public.signal_credit_transactions TO authenticated;
GRANT ALL ON public.signal_credit_transactions TO service_role;
ALTER TABLE public.signal_credit_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own ledger read" ON public.signal_credit_transactions FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(),'atlas_admin'));

CREATE TABLE public.signal_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.signal_accounts(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  api_key_id uuid,
  mode text NOT NULL DEFAULT 'live',
  direction text NOT NULL DEFAULT 'outbound',
  to_phone text NOT NULL,
  from_phone text,
  body text NOT NULL,
  encoding text NOT NULL DEFAULT 'GSM-7',
  segments integer NOT NULL DEFAULT 1,
  country_iso text,
  credits_charged bigint NOT NULL DEFAULT 0,
  cost_usd numeric NOT NULL DEFAULT 0,
  revenue_usd numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'queued',
  error_code text,
  error_detail text,
  upstream_ref text,
  alert_id uuid,
  callback_url text,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX signal_messages_account ON public.signal_messages(account_id, created_at DESC);
CREATE INDEX signal_messages_upstream ON public.signal_messages(upstream_ref);
GRANT SELECT ON public.signal_messages TO authenticated;
GRANT ALL ON public.signal_messages TO service_role;
ALTER TABLE public.signal_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own messages read" ON public.signal_messages FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(),'atlas_admin'));

CREATE TABLE public.signal_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.signal_accounts(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  phone_e164 text NOT NULL,
  language text NOT NULL DEFAULT 'en',
  hazards text[] NOT NULL DEFAULT '{}',
  lat double precision,
  lon double precision,
  radius_km integer NOT NULL DEFAULT 300,
  min_severity integer NOT NULL DEFAULT 2,
  country_iso text,
  status text NOT NULL DEFAULT 'active',
  external_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX signal_subscriptions_unique ON public.signal_subscriptions(account_id, phone_e164);
GRANT SELECT ON public.signal_subscriptions TO authenticated;
GRANT ALL ON public.signal_subscriptions TO service_role;
ALTER TABLE public.signal_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own subscriptions read" ON public.signal_subscriptions FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(),'atlas_admin'));
CREATE TRIGGER trg_signal_subscriptions_touch BEFORE UPDATE ON public.signal_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.signal_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.signal_accounts(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  hazard text NOT NULL,
  severity integer NOT NULL DEFAULT 3,
  headline text NOT NULL,
  body text NOT NULL,
  lat double precision,
  lon double precision,
  radius_km integer NOT NULL DEFAULT 300,
  mode text NOT NULL DEFAULT 'live',
  recipients integer NOT NULL DEFAULT 0,
  credits_charged bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'sent',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX signal_alerts_account ON public.signal_alerts(account_id, created_at DESC);
GRANT SELECT ON public.signal_alerts TO authenticated;
GRANT ALL ON public.signal_alerts TO service_role;
ALTER TABLE public.signal_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own alerts read" ON public.signal_alerts FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(),'atlas_admin'));

CREATE TABLE public.signal_webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.signal_accounts(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  url text NOT NULL,
  events text[] NOT NULL DEFAULT '{message.delivered,message.failed,message.inbound}',
  signing_secret text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.signal_webhooks TO authenticated;
GRANT ALL ON public.signal_webhooks TO service_role;
ALTER TABLE public.signal_webhooks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own webhooks" ON public.signal_webhooks FOR ALL TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(),'atlas_admin'))
  WITH CHECK (owner_id = auth.uid());
CREATE TRIGGER trg_signal_webhooks_touch BEFORE UPDATE ON public.signal_webhooks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.signal_webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id uuid NOT NULL REFERENCES public.signal_webhooks(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  event text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_status integer,
  attempts integer NOT NULL DEFAULT 1,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX signal_webhook_deliveries_hook ON public.signal_webhook_deliveries(webhook_id, created_at DESC);
GRANT SELECT ON public.signal_webhook_deliveries TO authenticated;
GRANT ALL ON public.signal_webhook_deliveries TO service_role;
ALTER TABLE public.signal_webhook_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own webhook deliveries read" ON public.signal_webhook_deliveries FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(),'atlas_admin'));

CREATE TABLE public.signal_usage_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.signal_accounts(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  day date NOT NULL,
  messages_sent integer NOT NULL DEFAULT 0,
  messages_delivered integer NOT NULL DEFAULT 0,
  messages_failed integer NOT NULL DEFAULT 0,
  credits_spent bigint NOT NULL DEFAULT 0,
  cost_usd numeric NOT NULL DEFAULT 0,
  revenue_usd numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX signal_usage_daily_unique ON public.signal_usage_daily(account_id, day);
GRANT SELECT ON public.signal_usage_daily TO authenticated;
GRANT ALL ON public.signal_usage_daily TO service_role;
ALTER TABLE public.signal_usage_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own usage read" ON public.signal_usage_daily FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(),'atlas_admin'));

CREATE OR REPLACE FUNCTION public.signal_reserve_credits(
  _account_id uuid, _credits bigint, _kind text, _reference text, _message_id uuid, _note text
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_owner uuid;
  v_balance bigint;
BEGIN
  SELECT owner_id, balance_credits INTO v_owner, v_balance
    FROM public.signal_accounts WHERE id = _account_id FOR UPDATE;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'account_not_found';
  END IF;
  IF _credits > 0 AND v_balance < _credits THEN
    RAISE EXCEPTION 'insufficient_credits';
  END IF;
  v_balance := v_balance - _credits;
  IF _credits > 0 THEN
    UPDATE public.signal_accounts
      SET balance_credits = v_balance,
          lifetime_spent_credits = lifetime_spent_credits + _credits
      WHERE id = _account_id;
  ELSE
    UPDATE public.signal_accounts
      SET balance_credits = v_balance,
          lifetime_purchased_credits = lifetime_purchased_credits
            + CASE WHEN _kind IN ('purchase','bonus') THEN -_credits ELSE 0 END
      WHERE id = _account_id;
  END IF;
  INSERT INTO public.signal_credit_transactions
    (account_id, owner_id, kind, credits, balance_after, reference, message_id, note)
  VALUES (_account_id, v_owner, _kind, -_credits, v_balance, _reference, _message_id, _note);
  RETURN v_balance;
END;
$$;

INSERT INTO public.signal_pricing_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;