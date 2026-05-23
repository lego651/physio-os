-- 020_real_therapists_seed.sql
-- Replace placeholder V-Health therapists with the 11 real therapists scraped from V-Health website.
-- FK investigation: therapists.id is NOT referenced by any table via FK (review_requests.therapist_name
-- and intake_records.therapist_name are both text columns, not FK). DELETE is safe.
-- Idempotent: DELETE then INSERT. Runs cleanly on repeated applies.

-- Remove placeholder seed therapists for V-Health.
DELETE FROM public.therapists
WHERE clinic_id = (SELECT id FROM public.clinics WHERE slug = 'vhealth');

-- Insert 11 real V-Health therapists.
-- Uses gen_random_uuid() via DEFAULT so we don't hard-code IDs.
INSERT INTO public.therapists (clinic_id, name, role, bio, specialties)
SELECT
  c.id,
  t.name,
  t.role,
  t.bio,
  t.specialties
FROM public.clinics c
CROSS JOIN (VALUES
  ('Dr. Fushun Ma',      'Osteopathy Therapist',           'Advanced manual osteopathy with medical precision',                       ARRAY['osteopathic therapy', 'manual therapy']),
  ('Dr. Kyle Wu',        'RMT, R.Ac',                      'Integrative massage and acupuncture for whole body balance',               ARRAY['massage therapy', 'acupuncture']),
  ('Keri',               'RMT',                            'Integrative Eastern and Western pain management therapy',                  ARRAY['massage therapy', 'pain management']),
  ('Olivia',             'RMT',                            'Clinical massage therapy for pain relief and recovery care',               ARRAY['massage therapy', 'pain relief']),
  ('Alice',              'RMT',                            'Advanced myofascial, lymphatic, and prenatal massage care',                ARRAY['massage therapy', 'myofascial', 'prenatal']),
  ('Kelley',             'RMT',                            'Lymphatic, cranial, and facial focused therapeutic care',                  ARRAY['lymphatic drainage', 'craniosacral therapy']),
  ('Aurora',             'RMT',                            'Gentle therapeutic massage therapy for children and seniors',              ARRAY['massage therapy', 'pediatric', 'senior care']),
  ('Alex',               'RMT',                            'TCM based manual therapy for pain and mobility',                          ARRAY['massage therapy', 'TCM', 'pain management']),
  ('Wendy',              'RMT',                            'Therapeutic massage and foot focused clinical care',                       ARRAY['massage therapy', 'foot care']),
  ('Amy',                'Foot Reflexologist',              'Professional foot reflexology for circulation and relaxation',             ARRAY['foot reflexology', 'relaxation']),
  ('Dr. Lizzy (Ji) Li',  'R.Ac. (Registered Acupuncturist)', 'Professional acupuncture for pain relief and wellness',                ARRAY['acupuncture', 'pain relief', 'wellness'])
) AS t(name, role, bio, specialties)
WHERE c.slug = 'vhealth';
