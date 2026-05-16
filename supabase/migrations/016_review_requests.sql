-- 016_review_requests.sql
-- S2 Review Engine: bootstrap clinics/therapists (idempotent with widget V1),
-- add Google review fields, create review_requests + review_opt_outs.

-- 1. clinics — multi-tenant root. Idempotent so a future widget V1 merge will not conflict.
CREATE TABLE IF NOT EXISTS public.clinics (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                text UNIQUE NOT NULL,
  name                text NOT NULL,
  domain              text NOT NULL DEFAULT '',
  janeapp_base_url    text,
  branding            jsonb NOT NULL DEFAULT '{}'::jsonb,
  monthly_message_cap int NOT NULL DEFAULT 10000,
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Google review-specific columns added on top of the base table.
ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS google_place_id    text,
  ADD COLUMN IF NOT EXISTS google_maps_url    text,
  ADD COLUMN IF NOT EXISTS review_sender_name text;

-- 2. therapists — for admin autocomplete in the send form.
CREATE TABLE IF NOT EXISTS public.therapists (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id          uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name               text NOT NULL,
  role               text NOT NULL DEFAULT 'therapist',
  bio                text NOT NULL DEFAULT '',
  janeapp_staff_id   int,
  specialties        text[] NOT NULL DEFAULT '{}',
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS therapists_clinic_idx ON public.therapists (clinic_id);

-- 3. Seed V-Health. Idempotent via ON CONFLICT.
INSERT INTO public.clinics (slug, name, domain, review_sender_name)
VALUES ('vhealth', 'V-Health Rehab Clinic', 'vhealth.ca', 'V-Health Rehab Clinic')
ON CONFLICT (slug) DO UPDATE SET review_sender_name = EXCLUDED.review_sender_name;

-- 4. review_requests: one row per admin-triggered send.
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

-- 5. review_opt_outs: one row per (clinic, contact, contact_type).
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

-- 6. RLS deny-anon policies (service_role bypasses RLS).
CREATE POLICY review_requests_deny_anon ON public.review_requests
  FOR ALL TO anon USING (false) WITH CHECK (false);

CREATE POLICY review_opt_outs_deny_anon ON public.review_opt_outs
  FOR ALL TO anon USING (false) WITH CHECK (false);
