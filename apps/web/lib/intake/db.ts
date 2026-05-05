import { createAdminClient } from '@/lib/supabase/admin'
import type { IntakeFields, IntakeRecord } from '@physio-os/shared'

export interface SaveIntakeRecordInput extends IntakeFields {
  source: 'telegram' | 'in_app' | 'manual'
  raw_transcript?: string | null
  clinic_id?: string
}

/**
 * Insert a new intake record. Uses service-role client to bypass RLS.
 * Returns the inserted row.
 */
export async function saveIntakeRecord(input: SaveIntakeRecordInput): Promise<IntakeRecord> {
  console.log('[intake/db] saving record', { source: input.source, patient: input.patient_name })
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('intake_records')
    .insert({
      clinic_id:      input.clinic_id ?? 'vhealth',
      patient_name:   input.patient_name,
      date_of_visit:  input.date_of_visit,
      therapist_name: input.therapist_name,
      treatment_area: input.treatment_area,
      session_notes:  input.session_notes,
      source:         input.source,
      raw_transcript: input.raw_transcript ?? null,
    })
    .select()
    .single()

  if (error) {
    console.error('[intake/db] insert failed', { error: error.message })
    throw error
  }

  console.log('[intake/db] record saved', { id: data.id })
  return data as IntakeRecord
}
