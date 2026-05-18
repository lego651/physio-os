// apps/web/app/(clinic)/dashboard/review-funnel/page.tsx
import { redirect } from 'next/navigation'
import { requireAdminAuth } from '@/lib/auth/require-admin'
import ReviewFunnelClient from './ReviewFunnelClient'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export default async function Page() {
  const auth = await requireAdminAuth()
  if (auth.error) redirect('/dashboard/login')

  // Data is fetched client-side via GET /api/admin/review-requests.
  // This server component only handles auth gating.
  return <ReviewFunnelClient />
}
