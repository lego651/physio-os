-- Demo seed for May 20 V-Health demo
-- 5 realistic intake records covering all 3 source paths
-- Run AFTER the 012_intake_records.sql migration is applied
--
-- To apply (in Supabase SQL editor):
--   Paste this entire file and click "Run"
--
-- To apply (CLI):
--   psql "$SUPABASE_DB_URL" -f supabase/seed-intake-demo.sql

INSERT INTO public.intake_records
  (clinic_id, patient_name, date_of_visit, therapist_name, treatment_area, session_notes, source, raw_transcript)
VALUES
  (
    'vhealth',
    'Wei Chen',
    '2026-05-18',
    'David Liu',
    'Lower back',
    'Patient presented with chronic lumbar tightness, 6/10 pain on flexion. Performed soft tissue release on QL and erector spinae bilaterally, followed by sacroiliac mobilization. Home program: glute bridges 3x10, cat-cow 2x10, walking 20 min daily. Re-eval in 1 week.',
    'manual',
    NULL
  ),
  (
    'vhealth',
    'Sarah Mitchell',
    '2026-05-19',
    'David Liu',
    'Right shoulder',
    'Subacromial impingement, 4 weeks post-onset, pain on overhead reach. Rotator cuff palpation reproduced symptoms at supraspinatus insertion. Treatment: dry needling supraspinatus + infraspinatus, scapular stabilization drills (wall slides, prone Y-T-W). Iced 10 min post-session. Plan: 2x/week for 3 weeks.',
    'telegram',
    'Patient is Sarah Mitchell, came in May 19, right shoulder pain about four weeks now, hurts when she reaches up. Did dry needling on supraspinatus and infraspinatus, gave her wall slides and Y-T-W drills, iced after. Booking her twice a week for three weeks.'
  ),
  (
    'vhealth',
    'James Park',
    '2026-05-19',
    'David Liu',
    'Left knee',
    'Post-op ACL reconstruction, week 8. ROM 0-125 (target 0-130). No effusion. Quad activation 80% of contralateral. Progressed to single-leg squats to 60 deg, step-downs from 6 inch box, balance work on Bosu. Cleared for stationary bike resistance level 4. Continue 3x/week.',
    'in_app',
    'James Park, week eight post-op ACL, left knee. Range zero to one twenty-five, no swelling, quad strength about eighty percent. Did single leg squats to sixty degrees, step downs from six inch box, balance on bosu. Cleared bike at resistance four. Three times a week.'
  ),
  (
    'vhealth',
    'Linda Zhao',
    '2026-05-20',
    'David Liu',
    'Neck and upper back',
    'Cervicogenic headaches, daily, worse by afternoon. Forward head posture and protracted scapulae on observation. Tender to palpation suboccipitals and upper trapezius bilaterally. Treatment: suboccipital release, cervical retraction exercises, thoracic extension over foam roller. Postural reminders for desk work. F/U in 5 days.',
    'in_app',
    'Linda Zhao came in today, neck and upper back, getting headaches every day worse in the afternoon. Forward head, rounded shoulders. Suboccipitals and upper traps tight on both sides. Did suboccipital release, gave her chin tucks and foam roller thoracic extensions, talked about her desk setup. See her in five days.'
  ),
  (
    'vhealth',
    'Michael Torres',
    '2026-05-20',
    'David Liu',
    'Right ankle',
    'Grade II lateral ankle sprain, 10 days post-injury. Mild residual swelling. Pain-free dorsiflexion to 15 deg, plantarflexion full. Single-leg balance 20 sec eyes open. Treatment: AROM all planes, theraband resisted inversion/eversion, single-leg stance progressions, calf raises 3x15. Cleared for jogging next session if pain-free walking confirmed.',
    'manual',
    NULL
  );
