
ALTER TABLE public.levels
  ADD COLUMN IF NOT EXISTS manifest jsonb,
  ADD COLUMN IF NOT EXISTS package_id text,
  ADD COLUMN IF NOT EXISTS package_version text,
  ADD COLUMN IF NOT EXISTS package_sha256 text,
  ADD COLUMN IF NOT EXISTS package_size_bytes bigint,
  ADD COLUMN IF NOT EXISTS package_storage_path text;

ALTER TABLE public.atlas_level_placements
  ADD COLUMN IF NOT EXISTS manifest_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS package_id text,
  ADD COLUMN IF NOT EXISTS package_version text,
  ADD COLUMN IF NOT EXISTS package_sha256 text,
  ADD COLUMN IF NOT EXISTS package_storage_path text;
