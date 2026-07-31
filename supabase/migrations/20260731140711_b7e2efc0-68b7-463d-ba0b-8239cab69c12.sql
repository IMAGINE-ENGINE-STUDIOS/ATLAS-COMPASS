ALTER TABLE public.signal_accounts
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS membership_tier text NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS membership_status text NOT NULL DEFAULT 'inactive',
  ADD COLUMN IF NOT EXISTS payg_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payg_card_brand text,
  ADD COLUMN IF NOT EXISTS payg_card_last4 text,
  ADD COLUMN IF NOT EXISTS monthly_spend_cap_usd numeric NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS per_broadcast_cap_usd numeric NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS month_spend_usd numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS month_period_start date NOT NULL DEFAULT date_trunc('month', now())::date;

CREATE TABLE IF NOT EXISTS public.wave_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.signal_accounts(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  kind text NOT NULL DEFAULT 'credit_pack',
  pack_id text,
  credits bigint NOT NULL DEFAULT 0,
  usd_amount numeric NOT NULL DEFAULT 0,
  stripe_session_id text,
  stripe_invoice_id text,
  status text NOT NULL DEFAULT 'pending',
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.wave_orders TO authenticated;
GRANT ALL ON public.wave_orders TO service_role;

ALTER TABLE public.wave_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Developers view their own orders"
  ON public.wave_orders FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

CREATE INDEX IF NOT EXISTS wave_orders_account_created_idx
  ON public.wave_orders (account_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS wave_orders_session_idx
  ON public.wave_orders (stripe_session_id) WHERE stripe_session_id IS NOT NULL;

CREATE TRIGGER wave_orders_touch_updated_at
  BEFORE UPDATE ON public.wave_orders
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();