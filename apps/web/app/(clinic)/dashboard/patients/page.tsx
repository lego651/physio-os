// apps/web/app/(clinic)/dashboard/patients/page.tsx
import { redirect } from 'next/navigation'
import { requireAdminAuth } from '@/lib/auth/require-admin'
import { createAdminClient } from '@/lib/supabase/admin'
import PatientsClient, { type PatientRow } from './PatientsClient'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export default async function Page() {
  const auth = await requireAdminAuth()
  if (auth.error) redirect('/dashboard/login')

  const supabase = createAdminClient()

  // 1. Resolve V-Health clinic id
  const { data: clinic } = await supabase
    .from('clinics')
    .select('id')
    .eq('slug', 'vhealth')
    .single()

  if (!clinic) {
    // Clinic not found — render empty state rather than crashing
    return (
      <PatientsClient patients={[]} />
    )
  }

  // 2. Fetch all patients for this clinic
  const { data: patients } = await supabase
    .from('patients')
    .select('id, name, phone, email')
    .eq('clinic_id', clinic.id)

  if (!patients || patients.length === 0) {
    return <PatientsClient patients={[]} />
  }

  // 3. Fetch session aggregates (count + max date) per patient_id
  const patientIds = patients.map((p) => p.id)

  const { data: records } = await supabase
    .from('intake_records')
    .select('patient_id, date_of_visit')
    .in('patient_id', patientIds)

  // Build per-patient aggregates in JS
  const aggregates: Record<string, { count: number; maxDate: string | null }> = {}
  for (const id of patientIds) {
    aggregates[id] = { count: 0, maxDate: null }
  }
  for (const rec of records ?? []) {
    if (!rec.patient_id) continue
    const agg = aggregates[rec.patient_id]
    if (!agg) continue
    agg.count += 1
    if (!agg.maxDate || rec.date_of_visit > agg.maxDate) {
      agg.maxDate = rec.date_of_visit
    }
  }

  // 4. Merge and sort: last visit DESC NULLS LAST, then name ASC
  const rows: PatientRow[] = patients
    .map((p) => ({
      id: p.id,
      name: p.name,
      phone: p.phone,
      email: p.email,
      last_visit: aggregates[p.id]?.maxDate ?? null,
      session_count: aggregates[p.id]?.count ?? 0,
    }))
    .sort((a, b) => {
      if (a.last_visit === null && b.last_visit === null) return a.name.localeCompare(b.name)
      if (a.last_visit === null) return 1
      if (b.last_visit === null) return -1
      if (b.last_visit !== a.last_visit) return b.last_visit.localeCompare(a.last_visit)
      return a.name.localeCompare(b.name)
    })

  return <PatientsClient patients={rows} />
}
