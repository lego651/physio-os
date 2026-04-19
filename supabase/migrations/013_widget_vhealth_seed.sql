-- 013_widget_vhealth_seed.sql — V-Health pilot clinic + 12 therapists

INSERT INTO public.clinics (slug, name, domain, janeapp_base_url, monthly_message_cap)
VALUES (
  'vhealth',
  'V-Health Rehab Clinic',
  'vhealth.ca',
  'https://vhealthc.janeapp.com/#/staff_member',
  5000
);

-- 12 therapists from vhealthc.janeapp.com (scraped 2026-04-19)
WITH c AS (SELECT id FROM public.clinics WHERE slug = 'vhealth')
INSERT INTO public.therapists (clinic_id, name, role, bio, janeapp_staff_id, specialties, languages, is_active)
SELECT c.id, name, role, bio, janeapp_staff_id, specialties, languages, true FROM c, (VALUES
  ('Dr. Fushun Ma', 'Manual Osteopathic Practitioner',
   'Surgical medical expert from Peking Union Medical College with 30,000+ procedures. Specializes in non-invasive manual joint correction, visceral manipulation, craniosacral therapy, myofascial release, cupping massage, therapeutic stretching.',
   18, ARRAY['osteopathy','joint correction','craniosacral','myofascial'], ARRAY['English','Chinese']),
  ('Amy Gon', 'Foot Reflexology Therapist',
   'Foot reflexology instructor with 5+ years in specialized foot massage. Treats flat feet correction, foot edema/varicose veins, plantar fasciitis, Achilles tendinitis. Note: not eligible for insurance coverage.',
   10, ARRAY['foot reflexology','plantar fasciitis','flat feet'], ARRAY['Chinese','English']),
  ('Ji Li Lizzy', 'Registered Acupuncturist',
   'Alberta College of Acupuncture & TCM graduate. Specializes in women''s health (PCOS, menstrual irregularities, menopause), chronic pain (cervical/lumbar spondylosis, frozen shoulder), weight management, facial rejuvenation acupuncture, stress-related conditions (insomnia, migraines, anxiety).',
   19, ARRAY['acupuncture','womens health','chronic pain','insomnia','anxiety'], ARRAY['Chinese','English']),
  ('Wan Ling "Wendy" Chen', 'Registered Massage Therapist',
   'RMT specializing in deep tissue, myofascial release, trigger point therapy, soft tissue mobilization. Focus on musculoskeletal conditions, chronic muscle tension, postural imbalance, repetitive strain. Also TCM-based foot therapy.',
   13, ARRAY['deep tissue','myofascial','trigger point','postural'], ARRAY['Chinese','English']),
  ('Cong Mei "Alice" Tang', 'Registered Massage Therapist',
   '3,000-hour Advanced Clinical Massage certification, CRMTA-registered with 6+ years experience. Senior RMT and clinical instructor. Specializes in advanced myofascial release, deep tissue reconstruction, clinical lymphatic drainage, prenatal care, hot stone, reflexology, acupressure, meridian massage.',
   15, ARRAY['myofascial','lymphatic drainage','prenatal','hot stone','acupressure'], ARRAY['Chinese','English']),
  ('Jia Ning "Alex" Sun', 'Registered Acupuncturist / TCM Practitioner',
   'Beijing University of Chinese Medicine graduate, formerly attending physician at Xiyuan Hospital, China Academy of Chinese Medical Sciences. Integrates TCM and Western medicine for acute/chronic musculoskeletal pain, muscle tension, movement dysfunction. Cupping, meridian release, acupressure, detoxification.',
   12, ARRAY['acupuncture','TCM','musculoskeletal pain','cupping','tuina'], ARRAY['Chinese','English']),
  ('Ke "Keri" Qiu', 'Registered Massage Therapist',
   'CITCM graduate with 2,200-hour Advanced Clinical Massage Diploma, currently studying Bachelor of Acupuncture. Integrates Eastern/Western techniques for acute/chronic pain. Tui Na, Gua Sha, cupping, Swedish, deep tissue, myofascial release, lymphatic drainage, hot stone, reflexology, Thai stretching.',
   9, ARRAY['tui na','gua sha','cupping','deep tissue','sports injury'], ARRAY['Chinese','English']),
  ('Kyle Wu', 'RMT and Registered Acupuncturist',
   'Dual-licensed RMT and acupuncturist integrating Eastern/Western approaches. Cupping therapy, Thai table massage, traditional Thai massage. Specializes in insomnia, tinnitus, stress-related tension, sleep disturbances, cosmetic acupuncture, head and nervous-system conditions.',
   6, ARRAY['acupuncture','massage','Thai massage','insomnia','tinnitus','cosmetic'], ARRAY['Chinese','English']),
  ('Nan "Olivia" Zheng', 'Registered Massage Therapist',
   'Makami College graduate, Advanced Clinical Massage Diploma with 3,000+ hours. Swedish, deep tissue, musculoskeletal assessment, pain management, functional palpation. Holistic approach integrating manual therapy with nutritional/lifestyle guidance, Yin-Yang and Five Elements principles.',
   8, ARRAY['swedish','deep tissue','holistic','pain management'], ARRAY['Chinese','English']),
  ('Che Zhou "Carl"', 'Therapist (please call clinic to confirm specialty)',
   'Specialty currently unconfirmed. Patients interested in booking should call the clinic at 403-966-6386 to confirm services offered.',
   20, ARRAY[]::text[], ARRAY['English']),
  ('Yulin Chen', 'Registered Massage Therapist',
   '2,200-hour diploma RMT. Specialized care for children, seniors, and expectant mothers. Gentle pressure control, supportive for school-aged children with academic stress and physical fatigue.',
   3, ARRAY['children','seniors','prenatal','gentle'], ARRAY['Chinese','English']),
  ('Hui Hua "Kelley" Chen', 'Registered Massage Therapist',
   'Senior RMT with 2,500+ clinical hours. Specializes in neurogenic cranial conditions (chronic headaches, migraines, tension-related fatigue), facial musculoskeletal biomechanics, aesthetic care, clinical lymphatic drainage (especially cranial/abdominal). Emphasizes precision and patient-specific assessment.',
   14, ARRAY['headaches','migraines','lymphatic drainage','aesthetic','facial'], ARRAY['Chinese','English'])
) AS t(name, role, bio, janeapp_staff_id, specialties, languages);
