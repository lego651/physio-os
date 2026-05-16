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

  const supabase = createAdminClient() as any
  const { data: clinics } = await supabase.from('clinics').select('id, name, slug').order('name')
  const { data: therapists } = await supabase.from('therapists').select('id, clinic_id, name, role').order('name')

  return (
    <AdminReviewRequestsClient
      clinics={(clinics as any[]) ?? []}
      therapists={(therapists as any[]) ?? []}
    />
  )
}
