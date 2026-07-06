
CREATE POLICY "user-datasets own read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'user-datasets' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "user-datasets own write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'user-datasets' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "user-datasets own update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'user-datasets' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "user-datasets own delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'user-datasets' AND auth.uid()::text = (storage.foldername(name))[1]);
