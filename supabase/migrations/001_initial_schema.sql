-- PhysioOS Initial Schema
-- Sprint 1 (S104): patients, messages, metrics, reports

-- Patients
CREATE TABLE public.patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id text NOT NULL DEFAULT 'vhealth',
  phone text UNIQUE NOT NULL,
  name text,
  language text NOT NULL DEFAULT 'en',
  profile jsonb DEFAULT '{}',
  daily_routine jsonb DEFAULT '{}',
  sharing_enabled boolean NOT NULL DEFAULT false,
  practitioner_name text,
  consent_at timestamptz,
  opted_out boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  auth_user_id uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_patients_phone ON public.patients(phone);
CREATE INDEX idx_patients_clinic ON public.patients(clinic_id);

-- Messages
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('web', 'sms')),
  media_urls text[] DEFAULT '{}',
  twilio_sid text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_messages_patient_created ON public.messages(patient_id, created_at DESC);

-- Metrics (structured data extracted from conversations)
CREATE TABLE public.metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  pain_level smallint CHECK (pain_level BETWEEN 1 AND 10),
  discomfort smallint CHECK (discomfort BETWEEN 0 AND 3),
  sitting_tolerance_min int CHECK (sitting_tolerance_min >= 0),
  exercises_done text[] DEFAULT '{}',
  exercise_count int DEFAULT 0,
  notes text,
  source_message_id uuid REFERENCES public.messages(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_metrics_patient_recorded ON public.metrics(patient_id, recorded_at DESC);

-- Weekly Reports
CREATE TABLE public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  summary text,
  metrics_summary jsonb DEFAULT '{}',
  insights text[] DEFAULT '{}',
  token text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(patient_id, week_start)
);
CREATE INDEX idx_reports_patient_week ON public.reports(patient_id, week_start DESC);
