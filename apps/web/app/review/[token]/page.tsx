// apps/web/app/review/[token]/page.tsx
//
// S2 patient landing page. Renders only for tokenized links generated
// by the ReviewRequestEngine. Other /review/<static> routes (existing
// AI Review Assistant) win via Next.js static-over-dynamic precedence.
import { notFound } from 'next/navigation'
import { verifyReviewToken } from '@/lib/review/tokens'
import { createAdminClient } from '@/lib/supabase/admin'
import { logFunnelEvent } from '@/lib/review/events'
import ReviewClient from './ReviewClient'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface PageProps { params: Promise<{ token: string }> }

export default async function ReviewPage({ params }: PageProps) {
  const { token } = await params
  const decoded = await verifyReviewToken(token)
  if (!decoded) notFound()

  const supabase = createAdminClient() as any
  const { data: row } = await supabase
    .from('review_requests')
    .select('id, patient_name, therapist_name, service_type, clinics!inner(name, google_place_id, google_maps_url)')
    .eq('id', decoded.requestId)
    .single()
  if (!row) notFound()

  // First visit only — logFunnelEvent dedupes link_clicked per request.
  await logFunnelEvent(supabase, { requestId: decoded.requestId, eventType: 'link_clicked' })

  const clinic = (row as any).clinics
  const mapsHref = clinic.google_place_id
    ? `https://search.google.com/local/writereview?placeid=${encodeURIComponent(clinic.google_place_id)}`
    : (clinic.google_maps_url ?? '#')

  return (
    <ReviewClient
      token={token}
      patientName={(row as any).patient_name}
      clinicName={clinic.name}
      mapsHref={mapsHref}
    />
  )
}
