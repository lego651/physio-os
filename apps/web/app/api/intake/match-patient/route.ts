import { NextResponse } from 'next/server'
import { createAdminClient } from '../../../../lib/supabase/admin'
import { matchPatient } from '../../../../lib/intake/match-patient'

export const runtime = 'nodejs'

export async function POST(request: Request): Promise<NextResponse> {
  console.log('[api/intake/match-patient] incoming request')

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { clinic_id, name } =
    (body as { clinic_id?: unknown; name?: unknown }) ?? {}

  if (!clinic_id || typeof clinic_id !== 'string') {
    return NextResponse.json({ error: 'clinic_id is required' }, { status: 400 })
  }

  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'name is required and must be non-empty' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // clinic_id from the caller is a slug (e.g. 'vhealth'), not a UUID.
  // patients.clinic_id stores UUID FKs, so we resolve the slug → UUID here.
  // This matches the pattern used by /api/intake/therapists.
  const { data: clinic, error: clinicError } = await supabase
    .from('clinics')
    .select('id')
    .eq('slug', clinic_id)
    .single()

  if (clinicError || !clinic) {
    console.warn('[api/intake/match-patient] clinic not found', { clinic_id })
    return NextResponse.json({ error: 'Clinic not found' }, { status: 404 })
  }

  try {
    const candidates = await matchPatient(clinic.id, name.trim(), supabase)
    console.log('[api/intake/match-patient] matched', {
      clinic_slug: clinic_id,
      clinic_id: clinic.id,
      name,
      count: candidates.length,
    })
    return NextResponse.json({ candidates })
  } catch (err) {
    console.error('[api/intake/match-patient] error', {
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Match failed' }, { status: 500 })
  }
}
