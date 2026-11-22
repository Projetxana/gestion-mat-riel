-- BuildTrack MVP4 — proposed, NOT applied to production.
-- Only safe, review-only candidate data. Never changes committed purchase values.
BEGIN;
ALTER TABLE public.bt_purchase_documents
  ADD COLUMN IF NOT EXISTS line_candidates jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(line_candidates)='array'
       AND jsonb_array_length(line_candidates)<=300),
  ADD COLUMN IF NOT EXISTS line_warnings text[] NOT NULL DEFAULT '{}'::text[];
COMMIT;
