import { requireAdminAuth } from '@/lib/auth/require-admin'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await requireAdminAuth()
  if (auth.error) return auth.error

  const url = new URL(request.url)
  const clinicId = url.searchParams.get('clinicId') ?? 'vhealth'

  const supabase = createAdminClient() as any
  const { data, error } = await supabase
    .from('therapists')
    .select('id, name, role')
    .eq('clinic_id', clinicId)
    .order('name')

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ therapists: data ?? [] })
}
