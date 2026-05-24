import { NextResponse } from 'next/server'
import { createPatient } from '../../../../lib/intake/db'

export const runtime = 'nodejs'

export async function POST(request: Request): Promise<NextResponse> {
  console.log('[api/intake/create-patient] incoming request')

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { clinic_id, name, phone, email, notes } =
    (body as { clinic_id?: unknown; name?: unknown; phone?: unknown; email?: unknown; notes?: unknown }) ?? {}

  if (!clinic_id || typeof clinic_id !== 'string') {
    return NextResponse.json({ error: 'clinic_id is required' }, { status: 400 })
  }

  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'name is required and must be non-empty' }, { status: 400 })
  }

  try {
    const patient = await createPatient({
      clinic_id,
      name: name.trim(),
      phone: typeof phone === 'string' && phone.trim() ? phone.trim() : null,
      email: typeof email === 'string' && email.trim() ? email.trim() : null,
      notes: typeof notes === 'string' && notes.trim() ? notes.trim() : null,
    })
    console.log('[api/intake/create-patient] created', { id: patient.id })
    return NextResponse.json(patient)
  } catch (err) {
    console.error('[api/intake/create-patient] db error', {
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Create patient failed' }, { status: 500 })
  }
}
