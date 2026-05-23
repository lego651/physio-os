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
-- bio is supplied explicitly to satisfy NOT NULL regardless of column default state in prod.
INSERT INTO public.therapists (clinic_id, name, role, bio, specialties)
SELECT
  c.id,
  t.name,
  t.role,
  t.bio,
  t.specialties
FROM public.clinics c
CROSS JOIN (VALUES
  ('Cindy Wu',       'RMT', 'Cindy is a Registered Massage Therapist specializing in deep tissue and relaxation massage, helping clients relieve tension and restore balance.',                       ARRAY['massage therapy', 'deep tissue', 'relaxation']),
  ('Michael Chen',   'RMT', 'Michael is an RMT with a focus on sports massage and trigger point therapy, working with active individuals to improve performance and recovery.',                     ARRAY['massage therapy', 'sports massage', 'trigger point']),
  ('Sarah Park',     'RMT', 'Sarah is a Registered Massage Therapist specializing in prenatal and Swedish massage, providing gentle and effective care for expectant mothers and general wellness.', ARRAY['massage therapy', 'prenatal massage', 'Swedish']),
  ('David Wang',     'OMT', 'David is an Osteopathic Manual Therapist with expertise in manual therapy and rehabilitation, addressing the root causes of pain through whole-body assessment.',       ARRAY['osteopathic therapy', 'manual therapy', 'rehabilitation']),
  ('Emily Liu',      'OMT', 'Emily is an Osteopathic Manual Therapist trained in visceral manipulation, helping clients with digestive, pelvic, and chronic musculoskeletal complaints.',            ARRAY['osteopathic therapy', 'visceral manipulation']),
  ('James Zhao',     'TCM', 'James is a Traditional Chinese Medicine practitioner specializing in acupuncture and cupping, supporting pain relief and overall wellness through time-tested methods.', ARRAY['acupuncture', 'cupping', 'TCM']),
  ('Linda Kim',      'TCM', 'Linda is a TCM practitioner offering acupuncture and dry needling to address pain, stress, and a wide range of acute and chronic conditions.',                        ARRAY['acupuncture', 'dry needling', 'traditional Chinese medicine']),
  ('Kevin Nguyen',   'RMT', 'Kevin is an RMT certified in IASTM and myofascial release, helping clients recover from injuries and improve soft-tissue mobility.',                                  ARRAY['massage therapy', 'IASTM', 'myofascial release']),
  ('Jessica Tran',   'RMT', 'Jessica is a Registered Massage Therapist with a gentle approach, specializing in lymphatic drainage and relaxation massage for post-surgical and stress-related conditions.', ARRAY['massage therapy', 'lymphatic drainage', 'relaxation']),
  ('Andrew Lee',     'OMT', 'Andrew is an Osteopathic Manual Therapist trained in craniosacral therapy, supporting nervous system balance and recovery from head, neck, and jaw complaints.',      ARRAY['osteopathic therapy', 'craniosacral therapy']),
  ('Michelle Zhang', 'TCM', 'Michelle is a TCM practitioner specializing in acupuncture, moxibustion, and herbal therapy, offering holistic care for chronic pain and immune support.',            ARRAY['acupuncture', 'moxibustion', 'herbal therapy']),
  ('Ryan Patel',     'RMT', 'Ryan is an RMT focused on deep tissue work and sports recovery, helping athletes and active clients manage soreness, prevent injury, and stay at their best.',         ARRAY['massage therapy', 'deep tissue', 'sports recovery'])
) AS t(name, role, bio, specialties)
WHERE c.slug = 'vhealth'
ON CONFLICT ON CONSTRAINT therapists_clinic_name_unique DO NOTHING;
