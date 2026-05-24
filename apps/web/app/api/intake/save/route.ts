import { NextResponse } from 'next/server'
import { saveIntakeRecord, createReviewRequestForIntake } from '../../../../lib/intake/db'
import { IntakeFieldsSchema } from '@physio-os/shared'
import { z } from 'zod'

export const runtime = 'nodejs'

const SaveBodySchema = IntakeFieldsSchema.extend({
  source: z.enum(['in_app', 'manual']).optional(),
  raw_transcript: z.string().nullable().optional(),
  patient_id: z.string().uuid().optional(),
})

export async function POST(request: Request): Promise<NextResponse> {
  console.log('[api/intake/save] incoming request')

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = SaveBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    )
  }

  let record
  try {
    record = await saveIntakeRecord({
      patient_name: parsed.data.patient_name,
      date_of_visit: parsed.data.date_of_visit,
      therapist_name: parsed.data.therapist_name,
      treatment_area: parsed.data.treatment_area,
      session_notes: parsed.data.session_notes,
      session_type: parsed.data.session_type,
      source: parsed.data.source ?? 'manual',
      raw_transcript: parsed.data.raw_transcript ?? null,
      patient_id: parsed.data.patient_id,
    })
    console.log('[api/intake/save] saved', { id: record.id })
  } catch (err) {
    console.error('[api/intake/save] db error', {
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Save failed' }, { status: 500 })
  }

  // D18-2: auto-create review_requests row, but only when session_type is
  // explicitly provided (voice flow always sends it; legacy IntakeForm /
  // manual saves do not). Non-atomic: if this fails, the intake row is
  // still committed and the front desk can recreate manually via "+ Add row".
  let review_request_id: string | null = null
  if (parsed.data.session_type !== undefined) {
    try {
      review_request_id = await createReviewRequestForIntake({
        intake_record_id: record.id,
        patient_name: record.patient_name,
        therapist_name: record.therapist_name,
        service_type: parsed.data.session_type,
      })
    } catch (err) {
      console.warn('[api/intake/save] review_request auto-create failed', {
        intake_id: record.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return NextResponse.json({ record, review_request_id })
}
