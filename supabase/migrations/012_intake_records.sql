-- 012_intake_records.sql — Phase 1 voice intake records
-- V-Health pilot: structured records captured via voice memo (Telegram/in-app) or manual entry.

CREATE TABLE public.intake_records (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       text NOT NULL DEFAULT 'vhealth',
  patient_name    text NOT NULL,
  date_of_visit   date NOT NULL,
  therapist_name  text NOT NULL,
  treatment_area  text NOT NULL,
  session_notes   text NOT NULL,
  source          text NOT NULL CHECK (source IN ('telegram', 'in_app', 'manual')),
  raw_transcript  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_intake_records_clinic_date
  ON public.intake_records(clinic_id, date_of_visit DESC);

-- Reuses public.set_updated_at() defined in 003_updated_at_trigger.sql
CREATE TRIGGER trg_intake_records_updated_at
  BEFORE UPDATE ON public.intake_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.intake_records ENABLE ROW LEVEL SECURITY;

-- Phase 1: any authenticated session may read all records (clinic-staff app, no per-row tenancy yet).
-- Writes go through the service role (bypasses RLS); no INSERT/UPDATE policies for `authenticated`.
CREATE POLICY intake_records_select ON public.intake_records
  FOR SELECT TO authenticated USING (true);
