
CREATE TABLE public.splat_landmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  longitude double precision NOT NULL,
  latitude double precision NOT NULL,
  altitude double precision NOT NULL DEFAULT 0,
  heading double precision NOT NULL DEFAULT 0,
  pitch double precision NOT NULL DEFAULT 0,
  roll double precision NOT NULL DEFAULT 0,
  scale double precision NOT NULL DEFAULT 1,
  radius_m double precision NOT NULL DEFAULT 300,
  file_path text NOT NULL,
  file_size_bytes bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.splat_landmarks TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.splat_landmarks TO authenticated;
GRANT ALL ON public.splat_landmarks TO service_role;

ALTER TABLE public.splat_landmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "splat_landmarks read all"
  ON public.splat_landmarks FOR SELECT
  USING (true);

CREATE POLICY "splat_landmarks insert auth"
  ON public.splat_landmarks FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "splat_landmarks update own"
  ON public.splat_landmarks FOR UPDATE
  TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "splat_landmarks delete own"
  ON public.splat_landmarks FOR DELETE
  TO authenticated
  USING (auth.uid() = owner_id);

CREATE TRIGGER splat_landmarks_touch
  BEFORE UPDATE ON public.splat_landmarks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX splat_landmarks_lonlat_idx ON public.splat_landmarks (longitude, latitude);

-- Storage policies (bucket already created via tool)
CREATE POLICY "splat files read auth"
  ON storage.objects FOR SELECT
  TO authenticated, anon
  USING (bucket_id = 'splat-landmarks');

CREATE POLICY "splat files auth upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'splat-landmarks'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "splat files owner update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'splat-landmarks'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "splat files owner delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'splat-landmarks'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
