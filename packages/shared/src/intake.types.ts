import { z } from 'zod'

/** The 5 structured fields extracted from a voice memo or entered manually */
export const IntakeFieldsSchema = z.object({
  patient_name: z.string().min(1),
  date_of_visit: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  therapist_name: z.string().min(1),
  treatment_area: z.string().min(1),
  session_notes: z.string().min(1),
})

export type IntakeFields = z.infer<typeof IntakeFieldsSchema>

/** Source of an intake record */
export type IntakeSource = 'telegram' | 'in_app' | 'manual'

/** A persisted intake record (what comes back from the DB) */
export interface IntakeRecord extends IntakeFields {
  id: string
  clinic_id: string
  source: IntakeSource
  raw_transcript: string | null
  created_at: string
  updated_at: string
}
