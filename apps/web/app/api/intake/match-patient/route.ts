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

  try {
    const supabase = createAdminClient()
    const candidates = await matchPatient(clinic_id, name.trim(), supabase)
    console.log('[api/intake/match-patient] matched', {
      clinic_id,
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
