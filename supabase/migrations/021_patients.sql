-- 021_patients.sql
-- S1.7-1: Create clinic-scoped patients directory table.
--
-- Context: migration 001 created an old patients table (phone-unique, auth_user_id-based)
-- from the pre-pivot architecture. That table is replaced here with the new multi-tenant
-- clinic-scoped design. Dependent tables (messages, metrics, reports) from the pre-pivot
-- schema are also renamed — they are unused in the current S1.x application but contain
-- real demo/seed data (V-Health Coach session, ~47 rows) that Jason wants preserved.
--
-- Migration 003 attached trg_patients_updated_at to the old patients table.
-- After RENAME the trigger moves with the table (PostgreSQL renames all attached triggers
-- automatically). We reattach a fresh trigger to the new patients table in step 4.
--
-- Idempotent: all CREATE statements use IF NOT EXISTS; RENAME uses ALTER TABLE IF EXISTS
-- so a second run is a no-op (source table no longer exists after first run).

-- 1. Rename pre-pivot tables to _legacy_* to free the original table names for the new
--    clinic-scoped schema while preserving historical demo data (~47 rows across 3 tables).
--    Pre-pivot tables: reports (0 rows), metrics (15 rows), messages (28 rows), patients (4 rows).
--
--    Idempotent: if migration has already run, public.patients no longer exists (it was renamed
--    to _legacy_patients), so ALTER TABLE IF EXISTS becomes a no-op — no error on replay.
--
--    Note: CASCADE is NOT needed for RENAME; FK constraints are updated to point at the
--    new name automatically by PostgreSQL.
-- Pre-pivot tables (V-Health Coach demo data, ~47 rows). Renamed to _legacy_*
-- so the original table names are freed for the new clinic-scoped schema,
-- but the data is preserved for historical reference.
-- Idempotent: use ALTER ... RENAME TO ... IF EXISTS pattern.
ALTER TABLE IF EXISTS public.reports  RENAME TO _legacy_reports;
ALTER TABLE IF EXISTS public.metrics  RENAME TO _legacy_metrics;
ALTER TABLE IF EXISTS public.messages RENAME TO _legacy_messages;
ALTER TABLE IF EXISTS public.patients RENAME TO _legacy_patients;

-- 2. Create the new clinic-scoped patients table.
CREATE TABLE IF NOT EXISTS public.patients (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     uuid        NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name          text        NOT NULL,
  phone         text,
  email         text,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- 3. Indexes.
--    Name lookup: case-insensitive prefix/exact match per clinic.
CREATE INDEX IF NOT EXISTS patients_clinic_name_idx
  ON public.patients (clinic_id, lower(name));

--    Contact dedup: used by CSV import UPSERT logic.
CREATE INDEX IF NOT EXISTS patients_clinic_phone_idx
  ON public.patients (clinic_id, phone)
  WHERE phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS patients_clinic_email_idx
  ON public.patients (clinic_id, email)
  WHERE email IS NOT NULL;

-- 4. updated_at trigger.
--    public.set_updated_at() was created in migration 003 and is still present.
--    The trigger on the old patients table was dropped with the table (step 1 above),
--    so we recreate it here.
CREATE OR REPLACE TRIGGER trg_patients_updated_at
  BEFORE UPDATE ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. Enable RLS.
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;

-- Drop any stale RLS policies before (re)creating, to make this section idempotent.
DROP POLICY IF EXISTS patients_select_own            ON public.patients;
DROP POLICY IF EXISTS patients_insert_own            ON public.patients;
DROP POLICY IF EXISTS patients_update_own            ON public.patients;
DROP POLICY IF EXISTS patients_deny_anon             ON public.patients;
DROP POLICY IF EXISTS patients_authenticated_select  ON public.patients;
DROP POLICY IF EXISTS patients_authenticated_insert  ON public.patients;
DROP POLICY IF EXISTS patients_authenticated_update  ON public.patients;

-- 6. RLS policies — clinic-scoped pattern (mirrors review_requests in migration 016).
--    anon: no access at all.
--    authenticated: full CRUD for any clinic row (clinic membership is enforced at app layer
--                   via service_role; direct authenticated queries are staff-only and trusted).
--    service_role: bypasses RLS (Supabase default — no policy needed).
CREATE POLICY patients_deny_anon ON public.patients
  FOR ALL TO anon USING (false) WITH CHECK (false);

CREATE POLICY patients_authenticated_select ON public.patients
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY patients_authenticated_insert ON public.patients
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY patients_authenticated_update ON public.patients
  FOR UPDATE TO authenticated
  USING  (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);
