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

  // Bug U: when patient_id is linked, look up the canonical name from patients table.
  // This ensures Whisper mis-transcriptions don't pollute intake_records.patient_name.
  let canonicalPatientName = input.patient_name
  if (input.patient_id) {
    const { data: patient } = await supabase
      .from('patients')
      .select('name')
      .eq('id', input.patient_id)
      .single()
    if (patient?.name) {
      canonicalPatientName = patient.name
    }
  }

  const { data, error } = await supabase
    .from('intake_records')
    .insert({
      clinic_id: input.clinic_id ?? 'vhealth',
      patient_name: canonicalPatientName,
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
 * S1.6 (D18-2): on voice-session confirm, always create a review_requests
 * row keyed to the intake record. Channel and status are auto-picked from patient contact:
 *   email present → channel='email', status='queued'
 *   no email but phone present → channel='sms', status='queued'
 *   neither → channel='email' (default, satisfies NOT NULL), status='pending'
 *             admin fills contact info later and sends manually
 *
 * NOT atomic with intake save: if this throws, caller logs a warning but
 * still returns 200 (the intake row is the source of truth, the review row
 * is derivable).
 *
 * Always returns the inserted review_requests.id (never null).
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
  let patientCanonicalName: string | null = null
  if (input.patient_id) {
    const { data: patient } = await supabase
      .from('patients')
      .select('name, phone, email')
      .eq('id', input.patient_id)
      .single()
    if (patient) {
      patientCanonicalName = patient.name ?? null
      patientPhone = patient.phone ?? null
      patientEmail = patient.email ?? null
    }
  }

  // Bug V: always INSERT a review_requests row so admin sees it in /dashboard/review-requests.
  // Auto-pick channel from available contact; fall back to 'email' default when neither
  // is present so the NOT NULL constraint is satisfied — admin fills contact + channel later.
  // status='queued' when contact exists (ready to send), 'pending' when no contact (admin action needed).
  let channel: 'email' | 'sms'
  let status: 'queued' | 'pending'
  if (patientEmail) {
    channel = 'email'
    status = 'queued'
  } else if (patientPhone) {
    channel = 'sms'
    status = 'queued'
  } else {
    channel = 'email'
    status = 'pending'
    console.log('[intake/db] no contact info — inserting pending row for admin to fill', {
      intake_record_id: input.intake_record_id,
      patient_id: input.patient_id ?? null,
    })
  }

  const { data, error } = await supabase
    .from('review_requests')
    .insert({
      clinic_id: clinic.id,
      intake_record_id: input.intake_record_id,
      patient_name: patientCanonicalName ?? input.patient_name,
      patient_email: patientEmail,
      patient_phone: patientPhone,
      patient_id: input.patient_id,
      therapist_name: input.therapist_name,
      service_type: input.service_type,
      channel,
      token_jti: randomUUID(),
      test_mode: false,
      status,
      expires_at: expiresAt,
      metadata: { source: 'voice_intake_auto' },
    })
    .select('id')
    .single()

  if (error || !data) {
    throw new Error(`createReviewRequestForIntake: insert failed — ${error?.message ?? 'unknown'}`)
  }

  console.log('[intake/db] review_request auto-created', { id: data.id, channel })
  return data.id as string
}
