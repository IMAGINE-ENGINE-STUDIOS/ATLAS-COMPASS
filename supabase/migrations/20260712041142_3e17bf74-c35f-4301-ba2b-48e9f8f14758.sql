
-- 1) Table
CREATE TABLE public.quake_event_files (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id TEXT NOT NULL,
  event_source TEXT NOT NULL DEFAULT 'usgs',
  event_place TEXT,
  event_mag NUMERIC,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  kind TEXT NOT NULL DEFAULT 'file',
  is_raw_seismogram BOOLEAN NOT NULL DEFAULT false,
  storage_path TEXT,
  external_url TEXT,
  mime_type TEXT,
  size_bytes BIGINT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX quake_event_files_event_idx
  ON public.quake_event_files(event_id, created_at DESC);
CREATE INDEX quake_event_files_owner_idx
  ON public.quake_event_files(owner_id);

-- 2) Grants
GRANT SELECT ON public.quake_event_files TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quake_event_files TO authenticated;
GRANT ALL ON public.quake_event_files TO service_role;

-- 3) RLS
ALTER TABLE public.quake_event_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view quake event files"
  ON public.quake_event_files FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can add quake event files"
  ON public.quake_event_files FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners can update their quake event files"
  ON public.quake_event_files FOR UPDATE
  TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners can delete their quake event files"
  ON public.quake_event_files FOR DELETE
  TO authenticated
  USING (auth.uid() = owner_id);

-- 4) updated_at trigger
CREATE TRIGGER touch_quake_event_files_updated_at
  BEFORE UPDATE ON public.quake_event_files
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 5) Storage policies for quake-event-files bucket
CREATE POLICY "Public read of quake event files bucket"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'quake-event-files');

CREATE POLICY "Authenticated users can upload quake event files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'quake-event-files'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Owners can update their quake event files"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'quake-event-files'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Owners can delete their quake event files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'quake-event-files'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
