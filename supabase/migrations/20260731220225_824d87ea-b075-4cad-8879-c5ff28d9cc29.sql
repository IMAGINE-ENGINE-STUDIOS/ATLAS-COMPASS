ALTER TABLE public.wave_orders REPLICA IDENTITY FULL;
ALTER TABLE public.signal_accounts REPLICA IDENTITY FULL;
ALTER TABLE public.signal_credit_transactions REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.wave_orders;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.signal_accounts;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.signal_credit_transactions;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;