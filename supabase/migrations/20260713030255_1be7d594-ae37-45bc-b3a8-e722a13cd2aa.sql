CREATE TABLE public.sos_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('warning','news','video','short','post')),
  title text NOT NULL,
  body text,
  media_url text,
  thumbnail_url text,
  hazard_type text,
  severity smallint,
  lat double precision,
  lon double precision,
  region text,
  source_url text,
  tags text[] DEFAULT '{}',
  share_count integer NOT NULL DEFAULT 0,
  like_count integer NOT NULL DEFAULT 0,
  is_pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.sos_posts TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.sos_posts TO authenticated;
GRANT ALL ON public.sos_posts TO service_role;

ALTER TABLE public.sos_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view sos posts" ON public.sos_posts FOR SELECT USING (true);
CREATE POLICY "Authed users create own posts" ON public.sos_posts FOR INSERT TO authenticated WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Authors update own posts" ON public.sos_posts FOR UPDATE TO authenticated USING (auth.uid() = author_id) WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Authors delete own posts" ON public.sos_posts FOR DELETE TO authenticated USING (auth.uid() = author_id);

CREATE INDEX sos_posts_created_at_idx ON public.sos_posts (created_at DESC);
CREATE INDEX sos_posts_kind_idx ON public.sos_posts (kind);

CREATE TRIGGER sos_posts_touch BEFORE UPDATE ON public.sos_posts
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.sos_posts;