-- supabase/migrations/025_sms_review_v2_tracking.sql
-- SMS Review V2: add click/copy/regen tracking columns to review_requests.
-- Rollback: see comment block at bottom of this file.

ALTER TABLE review_requests
  ADD COLUMN IF NOT EXISTS clicked_at       timestamptz,
  ADD COLUMN IF NOT EXISTS clicked_channel  text CHECK (clicked_channel IN ('gmap', 'ai')),
  ADD COLUMN IF NOT EXISTS copied_at        timestamptz,
  ADD COLUMN IF NOT EXISTS regenerated_count int NOT NULL DEFAULT 0;

-- ROLLBACK (run manually if needed):
-- ALTER TABLE review_requests
--   DROP COLUMN IF EXISTS clicked_at,
--   DROP COLUMN IF EXISTS clicked_channel,
--   DROP COLUMN IF EXISTS copied_at,
--   DROP COLUMN IF EXISTS regenerated_count;
