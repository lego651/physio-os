-- 018_intake_session_type.sql
-- S1.6: Carry session type from voice intake into review_requests so the
-- admin sees the service type without re-asking the therapist.

-- 1. intake_records.session_type — five-value enum, defaults to 'other' so
--    rows inserted by older code paths (Telegram webhook, manual) stay valid.
ALTER TABLE public.intake_records
  ADD COLUMN IF NOT EXISTS session_type text NOT NULL DEFAULT 'other'
  CHECK (session_type IN ('massage','physio','acupuncture','chiropractor','other'));

-- 2. review_requests.intake_record_id — nullable FK so existing rows
--    (manual + pre-S1.6 auto-created) remain valid with NULL.
ALTER TABLE public.review_requests
  ADD COLUMN IF NOT EXISTS intake_record_id uuid
  REFERENCES public.intake_records(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS review_requests_intake_record_idx
  ON public.review_requests (intake_record_id)
  WHERE intake_record_id IS NOT NULL;

-- 3. review_requests.status — expand CHECK to include 'pending'.
--    Migration 016 created the CHECK as
--      CHECK (status IN ('queued','sent','failed','expired','revoked'))
--    DROP + re-ADD is the standard idiom for expanding a CHECK constraint.
ALTER TABLE public.review_requests
  DROP CONSTRAINT IF EXISTS review_requests_status_check;

ALTER TABLE public.review_requests
  ADD CONSTRAINT review_requests_status_check
  CHECK (status IN ('pending','queued','sent','failed','expired','revoked'));
