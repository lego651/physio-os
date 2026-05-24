import { randomUUID } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import type { IntakeFields, IntakeRecord, SessionType } from '@physio-os/shared'

export interface SaveIntakeRecordInput extends IntakeFields {
  source: 'telegram' | 'in_app' | 'manual'
  raw_transcript?: string | null
  clinic_id?: string
  patient_id?: string
}

export interface CreatePatientInput {
  clinic_id: string
  name: string
  phone?: string | null
  email?: string | null
  notes?: string | null
}

export interface CreatedPatient {
  id: string
  name: string
  phone: string | null
  email: string | null
}

/**
 * S1.7-5: Insert a new patient row. Uses service-role client to bypass RLS.
 * Returns the inserted patient's id, name, phone, email.
 */
export async function createPatient(input: CreatePatientInput): Promise<CreatedPatient> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('patients')
    .insert({
      clinic_id: input.clinic_id,
      name: input.name,
      phone: input.phone ?? null,
      email: input.email ?? null,
      notes: input.notes ?? null,
    })
    .select('id, name, phone, email')
    .single()

  if (error || !data) {
    throw new Error(`createPatient: insert failed — ${error?.message ?? 'unknown'}`)
  }

  return {
    id: data.id,
    name: data.name,
    phone: data.phone,
    email: data.email,
  }
}

/**
 * Insert a new intake record. Uses service-role client to bypass RLS.
 * Returns the inserted row.
 */
export async function saveIntakeRecord(input: SaveIntakeRecordInput): Promise<IntakeRecord> {
  console.log('[intake/db] saving record', {
    source: input.source,
    patient: input.patient_name,
    session_type: input.session_type,
  })
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('intake_records')
    .insert({
      clinic_id: input.clinic_id ?? 'vhealth',
      patient_name: input.patient_name,
      date_of_visit: input.date_of_visit,
      therapist_name: input.therapist_name,
      treatment_area: input.treatment_area,
      session_notes: input.session_notes,
      session_type: input.session_type ?? 'other',
      source: input.source,
      raw_transcript: input.raw_transcript ?? null,
      patient_id: input.patient_id ?? null,
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

const TOKEN_EXPIRES_IN_DAYS = 14
const VHEALTH_SLUG = 'vhealth'

export interface CreateReviewRequestForIntakeInput {
  intake_record_id: string
  patient_name: string
  therapist_name: string | null
  service_type: SessionType
  clinic_slug?: string
  patient_id?: string
}

/**
 * S1.6 (D18-2): on voice-session confirm, create a pending review_requests
 * row keyed to the intake record. Contact info is null — the front desk
 * fills it in and sends. NOT atomic with intake save: if this throws,
 * caller logs a warning but still returns 200 (the intake row is the
 * source of truth, the review row is derivable).
 *
 * Returns the inserted review_requests.id.
 */
export async function createReviewRequestForIntake(
  input: CreateReviewRequestForIntakeInput,
): Promise<string> {
  const supabase = createAdminClient()

  const slug = input.clinic_slug ?? VHEALTH_SLUG
  const { data: clinic, error: clinicErr } = await supabase
    .from('clinics')
    .select('id')
    .eq('slug', slug)
    .single()
  if (clinicErr || !clinic) {
    throw new Error(`createReviewRequestForIntake: clinic '${slug}' not found`)
  }

  const expiresAt = new Date(Date.now() + TOKEN_EXPIRES_IN_DAYS * 86_400_000).toISOString()

  // S1.7-6: if a patient_id is linked, pull contact info from patients table.
  // Denormalised at insert time so the record reflects the contact used at send time.
  // If the lookup fails (patient deleted, etc.) we fall back gracefully to null.
  let patientPhone: string | null = null
  let patientEmail: string | null = null
  if (input.patient_id) {
    const { data: patient } = await supabase
      .from('patients')
      .select('phone, email')
      .eq('id', input.patient_id)
      .single()
    if (patient) {
      patientPhone = patient.phone ?? null
      patientEmail = patient.email ?? null
    }
  }

  const { data, error } = await supabase
    .from('review_requests')
    .insert({
      clinic_id: clinic.id,
      intake_record_id: input.intake_record_id,
      patient_name: input.patient_name,
      patient_email: patientEmail,
      patient_phone: patientPhone,
      patient_id: input.patient_id,
      therapist_name: input.therapist_name,
      service_type: input.service_type,
      channel: 'email',
      token_jti: randomUUID(),
      test_mode: false,
      status: 'pending',
      expires_at: expiresAt,
      metadata: { source: 'voice_intake_auto' },
    })
    .select('id')
    .single()

  if (error || !data) {
    throw new Error(`createReviewRequestForIntake: insert failed — ${error?.message ?? 'unknown'}`)
  }

  console.log('[intake/db] review_request auto-created', { id: data.id })
  return data.id as string
}
