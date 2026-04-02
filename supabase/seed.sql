-- Seed data for development
-- 3 test patients with varied languages and conditions

INSERT INTO public.patients (id, phone, name, language, profile, practitioner_name, consent_at, active) VALUES
  ('a1111111-1111-1111-1111-111111111111', '+16041110001', 'Lisa Chen', 'en',
   '{"injury": "L4-L5 disc herniation", "diagnosis": "Lumbar disc herniation with left-sided radiculopathy", "symptoms": "Lower back pain, left leg numbness", "triggers": ["prolonged sitting", "bending forward"], "goals": ["Return to desk work pain-free", "Resume hiking"], "treatmentPlan": "McKenzie exercises, core stabilization, gradual return to activity"}',
   'Dr. Sarah Kim', now() - interval '30 days', true),

  ('b2222222-2222-2222-2222-222222222222', '+16041110002', '王明', 'zh',
   '{"injury": "右肩旋转肌袖部分撕裂", "diagnosis": "Partial rotator cuff tear (right shoulder)", "symptoms": "Shoulder pain with overhead movements", "triggers": ["lifting heavy objects", "sleeping on right side"], "goals": ["Pain-free sleep", "Return to swimming"], "treatmentPlan": "Rotator cuff strengthening, scapular stabilization, activity modification"}',
   'Dr. James Wong', now() - interval '14 days', true),

  ('c3333333-3333-3333-3333-333333333333', '+16041110003', 'Mark Thompson', 'en',
   '{"injury": "Grade 2 ankle sprain (left)", "diagnosis": "Lateral ankle sprain with partial ATFL tear", "symptoms": "Ankle swelling, instability on uneven ground", "triggers": ["running", "stairs"], "goals": ["Return to basketball", "No more rolling ankle"], "treatmentPlan": "Balance training, ankle strengthening, proprioception exercises"}',
   'Dr. Sarah Kim', now() - interval '7 days', true);

-- Messages for Lisa (mix of web and SMS)
INSERT INTO public.messages (patient_id, role, content, channel, created_at) VALUES
  ('a1111111-1111-1111-1111-111111111111', 'assistant', 'Hi Lisa! How are you feeling today?', 'web', now() - interval '5 days'),
  ('a1111111-1111-1111-1111-111111111111', 'user', 'Morning! Back pain is about a 4 today, did my stretches.', 'web', now() - interval '5 days' + interval '1 hour'),
  ('a1111111-1111-1111-1111-111111111111', 'assistant', 'Great job doing your stretches! I''ve logged your pain at 4. That''s down from 5 yesterday. How''s the sitting tolerance?', 'web', now() - interval '5 days' + interval '1 hour 1 minute'),
  ('a1111111-1111-1111-1111-111111111111', 'user', 'Can sit for about 45 min now before it gets uncomfortable', 'web', now() - interval '5 days' + interval '1 hour 5 minutes'),
  ('a1111111-1111-1111-1111-111111111111', 'user', 'Pain is 3 today, feeling better', 'sms', now() - interval '4 days'),
  ('a1111111-1111-1111-1111-111111111111', 'assistant', 'That''s progress! Pain 3 logged. Keep up the exercises.', 'sms', now() - interval '4 days' + interval '2 minutes'),
  ('a1111111-1111-1111-1111-111111111111', 'user', 'Did 3 sets of bird dogs and dead bugs today', 'web', now() - interval '3 days'),
  ('a1111111-1111-1111-1111-111111111111', 'assistant', 'Excellent consistency! That''s 2 exercises logged. How''s the discomfort level?', 'web', now() - interval '3 days' + interval '1 minute'),
  ('a1111111-1111-1111-1111-111111111111', 'user', 'Discomfort about 1, pretty mild', 'web', now() - interval '3 days' + interval '5 minutes'),
  ('a1111111-1111-1111-1111-111111111111', 'user', 'Pain 4 today, sat too long at work', 'sms', now() - interval '1 day');

-- Messages for Wang Ming (Chinese)
INSERT INTO public.messages (patient_id, role, content, channel, created_at) VALUES
  ('b2222222-2222-2222-2222-222222222222', 'assistant', '你好明！今天肩膀感觉怎么样？', 'sms', now() - interval '4 days'),
  ('b2222222-2222-2222-2222-222222222222', 'user', '今天疼痛5分，做了肩部拉伸', 'sms', now() - interval '4 days' + interval '30 minutes'),
  ('b2222222-2222-2222-2222-222222222222', 'assistant', '已记录疼痛5分。坚持做拉伸很好！睡眠质量怎么样？', 'sms', now() - interval '4 days' + interval '31 minutes'),
  ('b2222222-2222-2222-2222-222222222222', 'user', '昨晚睡得还行，没有被疼醒', 'sms', now() - interval '3 days'),
  ('b2222222-2222-2222-2222-222222222222', 'user', 'Pain is 4 today, did my exercises', 'web', now() - interval '2 days'),
  ('b2222222-2222-2222-2222-222222222222', 'assistant', 'Good to hear! Pain 4 logged — that''s an improvement. Which exercises did you do?', 'web', now() - interval '2 days' + interval '1 minute');

-- Messages for Mark (inactive — last message 8 days ago)
INSERT INTO public.messages (patient_id, role, content, channel, created_at) VALUES
  ('c3333333-3333-3333-3333-333333333333', 'assistant', 'Hi Mark! How is the ankle today?', 'web', now() - interval '10 days'),
  ('c3333333-3333-3333-3333-333333333333', 'user', 'Pretty sore, pain 6 after basketball yesterday', 'web', now() - interval '10 days' + interval '2 hours'),
  ('c3333333-3333-3333-3333-333333333333', 'assistant', 'Pain 6 is higher than usual. Remember what Dr. Kim said about easing back into basketball. How''s the swelling?', 'web', now() - interval '10 days' + interval '2 hours 1 minute'),
  ('c3333333-3333-3333-3333-333333333333', 'user', 'Yeah a bit swollen. Will ice it', 'web', now() - interval '10 days' + interval '2 hours 5 minutes'),
  ('c3333333-3333-3333-3333-333333333333', 'user', 'Ankle pain 5 today, did balance exercises', 'sms', now() - interval '8 days');

-- Metrics for Lisa
INSERT INTO public.metrics (patient_id, recorded_at, pain_level, discomfort, sitting_tolerance_min, exercises_done, exercise_count, notes) VALUES
  ('a1111111-1111-1111-1111-111111111111', now() - interval '7 days', 5, 2, 30, '{"cat-cow", "bird-dog"}', 2, 'First day logging'),
  ('a1111111-1111-1111-1111-111111111111', now() - interval '6 days', 5, 2, 35, '{"bird-dog", "dead-bug", "cat-cow"}', 3, NULL),
  ('a1111111-1111-1111-1111-111111111111', now() - interval '5 days', 4, 1, 45, '{"bird-dog", "dead-bug"}', 2, 'Stretches done'),
  ('a1111111-1111-1111-1111-111111111111', now() - interval '4 days', 3, 1, 50, '{"cat-cow"}', 1, 'Feeling better'),
  ('a1111111-1111-1111-1111-111111111111', now() - interval '3 days', 3, 1, 50, '{"bird-dog", "dead-bug"}', 2, 'Consistent'),
  ('a1111111-1111-1111-1111-111111111111', now() - interval '2 days', 4, 2, 40, '{}', 0, 'Sat too long at work'),
  ('a1111111-1111-1111-1111-111111111111', now() - interval '1 day', 4, 1, 45, '{"bird-dog"}', 1, NULL);

-- Metrics for Wang Ming
INSERT INTO public.metrics (patient_id, recorded_at, pain_level, discomfort, sitting_tolerance_min, exercises_done, exercise_count, notes) VALUES
  ('b2222222-2222-2222-2222-222222222222', now() - interval '5 days', 6, 2, NULL, '{"shoulder-stretch"}', 1, NULL),
  ('b2222222-2222-2222-2222-222222222222', now() - interval '4 days', 5, 2, NULL, '{"shoulder-stretch", "scapular-squeeze"}', 2, 'Did stretches'),
  ('b2222222-2222-2222-2222-222222222222', now() - interval '3 days', 5, 1, NULL, '{}', 0, 'Rest day'),
  ('b2222222-2222-2222-2222-222222222222', now() - interval '2 days', 4, 1, NULL, '{"shoulder-stretch", "external-rotation"}', 2, 'Improvement'),
  ('b2222222-2222-2222-2222-222222222222', now() - interval '1 day', 4, 1, NULL, '{"shoulder-stretch"}', 1, NULL);

-- Metrics for Mark
INSERT INTO public.metrics (patient_id, recorded_at, pain_level, discomfort, sitting_tolerance_min, exercises_done, exercise_count, notes) VALUES
  ('c3333333-3333-3333-3333-333333333333', now() - interval '10 days', 6, 2, NULL, '{}', 0, 'After basketball'),
  ('c3333333-3333-3333-3333-333333333333', now() - interval '8 days', 5, 2, NULL, '{"single-leg-balance", "ankle-circles"}', 2, 'Balance exercises');
