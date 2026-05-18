// apps/web/app/(clinic)/dashboard/review-requests/page.tsx
import { redirect } from 'next/navigation'
import { requireAdminAuth } from '@/lib/auth/require-admin'
import { createAdminClient } from '@/lib/supabase/admin'
import AdminReviewRequestsClient from './AdminReviewRequestsClient'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export default async function Page() {
  const auth = await requireAdminAuth()
  if (auth.error) redirect('/dashboard/login')

  // createAdminClient returns an untyped Supabase client (no generated schema yet —
  // migrations 016/017 are pending prod apply). Casts are safe: shapes are validated
  // by the AdminReviewRequestsClient prop types at runtime.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const { data: clinics } = await supabase.from('clinics').select('id, name, slug').order('name')
  const { data: therapists } = await supabase
    .from('therapists')
    .select('id, clinic_id, name, role')
    .order('name')
  const { data: optOuts } = await supabase
    .from('review_opt_outs')
    .select('clinic_id, contact, contact_type')

  return (
    <AdminReviewRequestsClient
      clinics={clinics ?? []}
      therapists={therapists ?? []}
      optOuts={optOuts ?? []}
    />
  )
}
