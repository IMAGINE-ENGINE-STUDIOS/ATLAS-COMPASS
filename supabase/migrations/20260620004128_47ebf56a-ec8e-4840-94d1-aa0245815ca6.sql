
-- Extensions
CREATE EXTENSION IF NOT EXISTS citext;

-- =====================================================================
-- PROFILES
-- =====================================================================
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username citext UNIQUE,
  display_name text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.profiles TO anon, authenticated;
GRANT INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles are viewable by everyone"
  ON public.profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE TRIGGER profiles_touch_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'username',''), 'user_' || substr(NEW.id::text,1,8)),
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'display_name',''), NEW.email)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Safe username lookup (no email leakage)
CREATE OR REPLACE FUNCTION public.lookup_user_by_username(_q text)
RETURNS TABLE(id uuid, username text, display_name text, avatar_url text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, username::text, display_name, avatar_url
  FROM public.profiles
  WHERE username ILIKE (_q || '%')
  ORDER BY length(username::text) ASC
  LIMIT 20;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_user_by_username(text) TO authenticated;

-- =====================================================================
-- FRIENDSHIPS
-- =====================================================================
CREATE TYPE public.friendship_status AS ENUM ('pending','accepted','blocked');

CREATE TABLE public.friendships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  addressee_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.friendship_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (requester_id, addressee_id),
  CHECK (requester_id <> addressee_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.friendships TO authenticated;
GRANT ALL ON public.friendships TO service_role;

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Parties can view their friendships"
  ON public.friendships FOR SELECT
  TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

CREATE POLICY "Requester can create"
  ON public.friendships FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = requester_id);

CREATE POLICY "Either party can update"
  ON public.friendships FOR UPDATE
  TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

CREATE POLICY "Either party can delete"
  ON public.friendships FOR DELETE
  TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

CREATE TRIGGER friendships_touch_updated_at
  BEFORE UPDATE ON public.friendships
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_friendships_addressee ON public.friendships(addressee_id);
CREATE INDEX idx_friendships_requester ON public.friendships(requester_id);

-- =====================================================================
-- SHARE STATS
-- =====================================================================
CREATE TABLE public.share_recipients_stats (
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  share_count int NOT NULL DEFAULT 0,
  last_shared_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, recipient_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.share_recipients_stats TO authenticated;
GRANT ALL ON public.share_recipients_stats TO service_role;

ALTER TABLE public.share_recipients_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can view stats"
  ON public.share_recipients_stats FOR SELECT
  TO authenticated
  USING (auth.uid() = owner_id);

CREATE POLICY "Owner can write stats"
  ON public.share_recipients_stats FOR ALL
  TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- =====================================================================
-- FILE SHARES
-- =====================================================================
CREATE TYPE public.share_status AS ENUM ('pending','accepted','declined');

CREATE TABLE public.file_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  source_table text,
  source_id text,
  name text NOT NULL,
  thumbnail_url text,
  note text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status public.share_status NOT NULL DEFAULT 'pending',
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.file_shares TO authenticated;
GRANT ALL ON public.file_shares TO service_role;

ALTER TABLE public.file_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Parties can view their shares"
  ON public.file_shares FOR SELECT
  TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

CREATE POLICY "Sender can create"
  ON public.file_shares FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Recipient can update status"
  ON public.file_shares FOR UPDATE
  TO authenticated
  USING (auth.uid() = recipient_id)
  WITH CHECK (auth.uid() = recipient_id);

CREATE POLICY "Sender can delete"
  ON public.file_shares FOR DELETE
  TO authenticated
  USING (auth.uid() = sender_id);

CREATE TRIGGER file_shares_touch_updated_at
  BEFORE UPDATE ON public.file_shares
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_file_shares_recipient ON public.file_shares(recipient_id, created_at DESC);
CREATE INDEX idx_file_shares_sender ON public.file_shares(sender_id, created_at DESC);

-- record_share RPC
CREATE OR REPLACE FUNCTION public.record_share(
  _recipient uuid,
  _kind text,
  _name text,
  _payload jsonb,
  _source_table text DEFAULT NULL,
  _source_id text DEFAULT NULL,
  _thumbnail_url text DEFAULT NULL,
  _note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_sender uuid := auth.uid();
BEGIN
  IF v_sender IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;
  IF v_sender = _recipient THEN
    RAISE EXCEPTION 'cannot share to self';
  END IF;

  INSERT INTO public.file_shares
    (sender_id, recipient_id, kind, name, payload, source_table, source_id, thumbnail_url, note)
  VALUES
    (v_sender, _recipient, _kind, _name, COALESCE(_payload,'{}'::jsonb), _source_table, _source_id, _thumbnail_url, _note)
  RETURNING id INTO v_id;

  INSERT INTO public.share_recipients_stats (owner_id, recipient_id, share_count, last_shared_at)
  VALUES (v_sender, _recipient, 1, now())
  ON CONFLICT (owner_id, recipient_id)
  DO UPDATE SET share_count = share_recipients_stats.share_count + 1,
                last_shared_at = now();

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_share(uuid,text,text,jsonb,text,text,text,text) TO authenticated;

-- =====================================================================
-- MATCHMAKING
-- =====================================================================
CREATE TABLE public.match_queue (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  mode text NOT NULL,
  skill int NOT NULL DEFAULT 1000,
  region text NOT NULL DEFAULT 'global',
  party_size int NOT NULL DEFAULT 2,
  joined_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.match_queue TO authenticated;
GRANT ALL ON public.match_queue TO service_role;

ALTER TABLE public.match_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User manages own queue row"
  ON public.match_queue FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_match_queue_bucket ON public.match_queue(mode, region, skill, joined_at);

CREATE TABLE public.matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mode text NOT NULL,
  region text NOT NULL DEFAULT 'global',
  player_ids uuid[] NOT NULL,
  state text NOT NULL DEFAULT 'forming',
  room_channel text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.matches TO authenticated;
GRANT ALL ON public.matches TO service_role;

ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players can view their matches"
  ON public.matches FOR SELECT
  TO authenticated
  USING (auth.uid() = ANY(player_ids));

CREATE POLICY "Players can update their matches"
  ON public.matches FOR UPDATE
  TO authenticated
  USING (auth.uid() = ANY(player_ids));

CREATE TRIGGER matches_touch_updated_at
  BEFORE UPDATE ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.file_shares;
ALTER PUBLICATION supabase_realtime ADD TABLE public.matches;
ALTER PUBLICATION supabase_realtime ADD TABLE public.match_queue;
ALTER PUBLICATION supabase_realtime ADD TABLE public.friendships;
