-- 019_therapists_seed.sql
-- Seed V-Health therapist roster for the voice intake therapist picker.
-- Idempotent: uses ON CONFLICT DO NOTHING on (clinic_id, name).
-- Run after 016_review_requests.sql (which creates clinics + therapists tables).

-- Add unique constraint to prevent duplicate seeds across reruns.
-- (Guards the ON CONFLICT below; safe to run multiple times via IF NOT EXISTS.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'therapists_clinic_name_unique'
  ) THEN
    ALTER TABLE public.therapists
      ADD CONSTRAINT therapists_clinic_name_unique UNIQUE (clinic_id, name);
  END IF;
END $$;

-- Seed 12 V-Health therapists.
-- References clinics.id via subquery on slug so the seed is portable across environments.
INSERT INTO public.therapists (clinic_id, name, role, specialties)
SELECT
  c.id,
  t.name,
  t.role,
  t.specialties
FROM public.clinics c
CROSS JOIN (VALUES
  ('Cindy Wu',          'RMT',  ARRAY['massage therapy', 'deep tissue', 'relaxation']),
  ('Michael Chen',      'RMT',  ARRAY['massage therapy', 'sports massage', 'trigger point']),
  ('Sarah Park',        'RMT',  ARRAY['massage therapy', 'prenatal massage', 'Swedish']),
  ('David Wang',        'OMT',  ARRAY['osteopathic therapy', 'manual therapy', 'rehabilitation']),
  ('Emily Liu',         'OMT',  ARRAY['osteopathic therapy', 'visceral manipulation']),
  ('James Zhao',        'TCM',  ARRAY['acupuncture', 'cupping', 'TCM']),
  ('Linda Kim',         'TCM',  ARRAY['acupuncture', 'dry needling', 'traditional Chinese medicine']),
  ('Kevin Nguyen',      'RMT',  ARRAY['massage therapy', 'IASTM', 'myofascial release']),
  ('Jessica Tran',      'RMT',  ARRAY['massage therapy', 'lymphatic drainage', 'relaxation']),
  ('Andrew Lee',        'OMT',  ARRAY['osteopathic therapy', 'craniosacral therapy']),
  ('Michelle Zhang',    'TCM',  ARRAY['acupuncture', 'moxibustion', 'herbal therapy']),
  ('Ryan Patel',        'RMT',  ARRAY['massage therapy', 'deep tissue', 'sports recovery'])
) AS t(name, role, specialties)
WHERE c.slug = 'vhealth'
ON CONFLICT ON CONSTRAINT therapists_clinic_name_unique DO NOTHING;
