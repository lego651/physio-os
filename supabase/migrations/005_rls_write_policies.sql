-- RLS Write Policies (S2-R015)
-- Allow patients to insert/update their own records

-- Patients: insert own (for onboarding when creating patient record)
CREATE POLICY "patients_insert_own" ON public.patients
  FOR INSERT WITH CHECK (auth.uid() = auth_user_id);

-- Patients: update own (for onboarding name, language, profile, consent)
CREATE POLICY "patients_update_own" ON public.patients
  FOR UPDATE USING (auth.uid() = auth_user_id)
  WITH CHECK (auth.uid() = auth_user_id);

-- Metrics: insert own (for recording recovery metrics)
CREATE POLICY "metrics_insert_own" ON public.metrics
  FOR INSERT WITH CHECK (
    patient_id IN (SELECT id FROM public.patients WHERE auth_user_id = auth.uid())
  );
