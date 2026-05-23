-- 023_mock_test_patients.sql
-- S1.7-9: Seed 2 test patients into V-Health for end-to-end channel verification.
--
-- Patient 1 — Jason Gao: email-only path (email = jasonusca@gmail.com, phone = NULL)
-- Patient 2 — Ethan Liu: SMS-only path   (phone = real number below, email = NULL)
--
-- ⚠️  BEFORE APPLYING TO PROD: replace the placeholder phone for Ethan Liu.
--     The placeholder '+1-403-555-0123' is NOT a real number.
--     Jason to supply the real Twilio trial verified caller ID (see docs/s2-backlog.md:23).
--
-- Depends on: migration 021 (patients table must exist).
-- Idempotent: DELETE then INSERT — safe to re-run.

DO $$
DECLARE
  vhealth_id uuid;
BEGIN
  SELECT id INTO vhealth_id FROM public.clinics WHERE slug = 'vhealth';

  IF vhealth_id IS NULL THEN
    RAISE EXCEPTION 'clinic slug ''vhealth'' not found — migration 016 may not have been applied';
  END IF;

  -- Idempotency: remove any prior test rows for these two names in this clinic.
  DELETE FROM public.patients
  WHERE clinic_id = vhealth_id
    AND name IN ('Jason Gao', 'Ethan Liu');

  -- Patient 1: Jason Gao — email channel test
  INSERT INTO public.patients (id, clinic_id, name, email, phone, notes)
  VALUES (
    gen_random_uuid(),
    vhealth_id,
    'Jason Gao',
    'jasonusca@gmail.com',
    NULL,
    'Test patient — email channel verification'
  );

  -- Patient 2: Ethan Liu — SMS channel test
  -- TODO: replace '+12368682134' with Jason's real Twilio verified caller ID before prod apply.
  INSERT INTO public.patients (id, clinic_id, name, email, phone, notes)
  VALUES (
    gen_random_uuid(),
    vhealth_id,
    'Ethan Liu',
    NULL,
    '+12368682134',
    'Test patient — SMS channel verification'
  );
END $$;
