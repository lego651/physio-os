-- 022_patient_id_fk.sql
-- S1.7-2: Add patient_id nullable FK to intake_records and review_requests.
--
-- Context: migration 021 created the new clinic-scoped patients table.
-- This migration links intake_records and review_requests back to that table
-- via a nullable FK so historical rows are unaffected (patient_id = NULL).
--
-- ON DELETE SET NULL: if a patients row is deleted, linked intake/review rows
-- are preserved but unlinked — intake data is never lost.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.

-- intake_records.patient_id ---------------------------------------------------

ALTER TABLE public.intake_records
  ADD COLUMN IF NOT EXISTS patient_id uuid
  REFERENCES public.patients(id) ON DELETE SET NULL;

-- Partial index: only index rows that ARE linked; unlinked rows (NULL) are
-- the common case for historical data and don't benefit from indexing.
CREATE INDEX IF NOT EXISTS intake_records_patient_idx
  ON public.intake_records (patient_id)
  WHERE patient_id IS NOT NULL;

-- review_requests.patient_id --------------------------------------------------

ALTER TABLE public.review_requests
  ADD COLUMN IF NOT EXISTS patient_id uuid
  REFERENCES public.patients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS review_requests_patient_idx
  ON public.review_requests (patient_id)
  WHERE patient_id IS NOT NULL;
