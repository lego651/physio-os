-- RLS Policies (S105)
-- Patients read own data; admin uses service role (bypasses RLS)

-- Enable RLS on all tables
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- Patients: read own row
CREATE POLICY "patients_select_own" ON public.patients
  FOR SELECT USING (auth.uid() = auth_user_id);

-- Messages: read/insert own
CREATE POLICY "messages_select_own" ON public.messages
  FOR SELECT USING (
    patient_id IN (SELECT id FROM public.patients WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "messages_insert_own" ON public.messages
  FOR INSERT WITH CHECK (
    patient_id IN (SELECT id FROM public.patients WHERE auth_user_id = auth.uid())
  );

-- Metrics: read own
CREATE POLICY "metrics_select_own" ON public.metrics
  FOR SELECT USING (
    patient_id IN (SELECT id FROM public.patients WHERE auth_user_id = auth.uid())
  );

-- Reports: read own
CREATE POLICY "reports_select_own" ON public.reports
  FOR SELECT USING (
    patient_id IN (SELECT id FROM public.patients WHERE auth_user_id = auth.uid())
  );
