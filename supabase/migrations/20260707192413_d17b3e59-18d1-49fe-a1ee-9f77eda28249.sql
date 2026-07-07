
CREATE POLICY "building-models owner read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'building-models' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "building-models owner insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'building-models' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "building-models owner update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'building-models' AND auth.uid()::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'building-models' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "building-models owner delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'building-models' AND auth.uid()::text = (storage.foldername(name))[1]);
