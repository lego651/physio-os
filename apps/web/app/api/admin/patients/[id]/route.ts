import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminAuth } from '@/lib/auth/require-admin'
import { isValidUUID } from '@/lib/validation'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminAuth()
  if (auth.error) return auth.error

  const { id } = await params
  if (!isValidUUID(id)) {
    return Response.json({ error: 'Invalid patient ID' }, { status: 400 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { name, language, practitioner_name, condition } = body as Record<string, unknown>

  // Build the update payload — only include fields that were sent
  const update: Record<string, unknown> = {}

  if (name !== undefined) {
    if (typeof name !== 'string' || name.trim().length === 0) {
      return Response.json({ error: 'Name must be a non-empty string' }, { status: 400 })
    }
    update.name = name.trim()
  }

  if (language !== undefined) {
    if (language !== 'en' && language !== 'zh') {
      return Response.json({ error: 'Language must be "en" or "zh"' }, { status: 400 })
    }
    update.language = language
  }

  if (practitioner_name !== undefined) {
    update.practitioner_name =
      typeof practitioner_name === 'string' ? practitioner_name.trim() || null : null
  }

  if (Object.keys(update).length === 0 && condition === undefined) {
    return Response.json({ error: 'No updatable fields provided' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Handle profile.diagnosis update — merge with existing profile
  if (condition !== undefined) {
    const { data: current } = await supabase
      .from('patients')
      .select('profile')
      .eq('id', id)
      .single()

    const existingProfile =
      current?.profile && typeof current.profile === 'object' && !Array.isArray(current.profile)
        ? (current.profile as Record<string, unknown>)
        : {}

    update.profile = {
      ...existingProfile,
      diagnosis: typeof condition === 'string' ? condition.trim() || null : null,
    }
  }

  const { data: patient, error } = await supabase
    .from('patients')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('[admin/patients/[id]] Update failed:', error)
    return Response.json({ error: 'Failed to update patient' }, { status: 500 })
  }

  if (!patient) {
    return Response.json({ error: 'Patient not found' }, { status: 404 })
  }

  return Response.json(patient)
}
