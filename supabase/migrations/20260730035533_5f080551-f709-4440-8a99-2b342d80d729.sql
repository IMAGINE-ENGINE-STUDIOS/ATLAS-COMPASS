DROP INDEX IF EXISTS public.idx_hazard_keywords_unique;
CREATE UNIQUE INDEX idx_hazard_keywords_unique ON public.hazard_keywords USING btree (lang, hazard, normalized);