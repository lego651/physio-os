import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminAuth } from '@/lib/auth/require-admin'
import { isValidUUID } from '@/lib/validation'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminAuth()
  if (auth.error) return auth.error

  const { id } = await params
  if (!isValidUUID(id)) {
    return Response.json({ error: 'Invalid patient ID' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Fetch current active state
  const { data: current, error: fetchError } = await supabase
    .from('patients')
    .select('active')
    .eq('id', id)
    .single()

  if (fetchError || !current) {
    return Response.json({ error: 'Patient not found' }, { status: 404 })
  }

  // Toggle and persist
  const { data: patient, error: updateError } = await supabase
    .from('patients')
    .update({ active: !current.active })
    .eq('id', id)
    .select()
    .single()

  if (updateError || !patient) {
    console.error('[admin/patients/[id]/toggle-active] Update failed:', updateError)
    return Response.json({ error: 'Failed to toggle active state' }, { status: 500 })
  }

  return Response.json(patient)
}
