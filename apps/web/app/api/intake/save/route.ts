import { NextResponse } from 'next/server'
import { saveIntakeRecord } from '../../../../lib/intake/db'
import { IntakeFieldsSchema } from '@physio-os/shared'
import { z } from 'zod'

export const runtime = 'nodejs'

const SaveBodySchema = IntakeFieldsSchema.extend({
  source: z.enum(['telegram', 'in_app', 'manual']).optional(),
  raw_transcript: z.string().nullable().optional(),
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
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 })
  }

  try {
    const record = await saveIntakeRecord({
      patient_name:   parsed.data.patient_name,
      date_of_visit:  parsed.data.date_of_visit,
      therapist_name: parsed.data.therapist_name,
      treatment_area: parsed.data.treatment_area,
      session_notes:  parsed.data.session_notes,
      source:         parsed.data.source ?? 'manual',
      raw_transcript: parsed.data.raw_transcript ?? null,
    })
    console.log('[api/intake/save] saved', { id: record.id })
    return NextResponse.json({ record })
  } catch (err) {
    console.error('[api/intake/save] db error', {
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Save failed' }, { status: 500 })
  }
}
