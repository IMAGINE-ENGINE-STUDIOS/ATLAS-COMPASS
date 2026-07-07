-- Allow the level's owner and users the level is shared with to manage
-- placements on their level (not just the person who originally placed it).
-- Public levels: any authenticated user can manage placements too, so the
-- Atlas isn't left with orphaned green boxes from previous sessions.
DROP POLICY IF EXISTS "owners manage their placements" ON public.atlas_level_placements;

CREATE POLICY "owners and level editors manage placements"
ON public.atlas_level_placements
FOR ALL
TO authenticated
USING (
  auth.uid() = owner_id
  OR EXISTS (
    SELECT 1 FROM public.levels l
    WHERE l.id = atlas_level_placements.level_id
      AND (
        l.owner_id = auth.uid()
        OR auth.uid() = ANY (l.shared_with)
        OR l.is_public = true
      )
  )
)
WITH CHECK (
  auth.uid() = owner_id
  OR EXISTS (
    SELECT 1 FROM public.levels l
    WHERE l.id = atlas_level_placements.level_id
      AND (
        l.owner_id = auth.uid()
        OR auth.uid() = ANY (l.shared_with)
        OR l.is_public = true
      )
  )
);