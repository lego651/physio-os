-- 016_review_requests.sql
-- S2 Review Engine: clinic Google Business Profile fields + review_requests + opt-outs.

-- 1. Extend the existing clinics table (from 012) with Google review fields.
ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS google_place_id    text,
  ADD COLUMN IF NOT EXISTS google_maps_url    text,
  ADD COLUMN IF NOT EXISTS review_sender_name text;

-- 2. review_requests: one row per admin-triggered send.
CREATE TABLE public.review_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_name    text NOT NULL,
  patient_email   text,
  patient_phone   text,
  therapist_name  text,
  service_type    text,
  channel         text NOT NULL CHECK (channel IN ('email','sms','both')),
  token_jti       uuid NOT NULL UNIQUE,
  test_mode       boolean NOT NULL DEFAULT false,
  status          text NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued','sent','failed','expired','revoked')),
  failure_reason  text,
  verified_at     timestamptz,
  metadata        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL,
  created_by      uuid
);

CREATE INDEX review_requests_clinic_created_idx
  ON public.review_requests (clinic_id, created_at DESC);

CREATE INDEX review_requests_status_expires_idx
  ON public.review_requests (status, expires_at);

ALTER TABLE public.review_requests ENABLE ROW LEVEL SECURITY;

-- 3. review_opt_outs: one row per (clinic, contact, contact_type).
CREATE TABLE public.review_opt_outs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  contact       text NOT NULL,
  contact_type  text NOT NULL CHECK (contact_type IN ('email','sms')),
  opted_out_at  timestamptz NOT NULL DEFAULT now(),
  source        text NOT NULL CHECK (source IN ('email_link','sms_keyword','admin')),
  UNIQUE (clinic_id, contact, contact_type)
);

CREATE INDEX review_opt_outs_lookup_idx
  ON public.review_opt_outs (clinic_id, contact, contact_type);

ALTER TABLE public.review_opt_outs ENABLE ROW LEVEL SECURITY;

-- 4. RLS: service_role bypasses RLS automatically; deny all anon access.
CREATE POLICY review_requests_deny_anon ON public.review_requests
  FOR ALL TO anon USING (false) WITH CHECK (false);

CREATE POLICY review_opt_outs_deny_anon ON public.review_opt_outs
  FOR ALL TO anon USING (false) WITH CHECK (false);
