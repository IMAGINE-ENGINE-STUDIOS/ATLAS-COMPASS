-- Per-tile widget storage: each Atlas tile (z/x/y) can carry a user-owned
-- "tile card" with attached datasets / indicators (topography, tomography,
-- geology, seismic overlays, custom bundles, etc.). A card is uniquely keyed
-- by (owner_id, z, x, y).
CREATE TABLE public.tile_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  z integer NOT NULL,
  x integer NOT NULL,
  y integer NOT NULL,
  title text,
  notes text,
  -- Center coords cached for quick listing without recomputing tile math.
  center_lat double precision,
  center_lng double precision,
  -- Attached indicators / datasets. Each entry:
  --   { id, kind, label, color, source?, url?, unit?, value?, meta? }
  indicators jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Free-form key/value metrics displayed in the card body.
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  tags text[] NOT NULL DEFAULT '{}'::text[],
  is_public boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, z, x, y)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tile_cards TO authenticated;
GRANT SELECT ON public.tile_cards TO anon;
GRANT ALL ON public.tile_cards TO service_role;

ALTER TABLE public.tile_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their tile cards"
  ON public.tile_cards
  FOR ALL
  TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Public tile cards are readable"
  ON public.tile_cards
  FOR SELECT
  USING (is_public = true);

CREATE INDEX tile_cards_owner_zxy_idx
  ON public.tile_cards (owner_id, z, x, y);
CREATE INDEX tile_cards_public_zxy_idx
  ON public.tile_cards (z, x, y) WHERE is_public;

CREATE TRIGGER touch_tile_cards_updated_at
  BEFORE UPDATE ON public.tile_cards
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();