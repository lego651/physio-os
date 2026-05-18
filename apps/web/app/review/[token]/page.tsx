// apps/web/app/review/[token]/page.tsx
//
// S2 patient landing page. Accepts either:
//   • a JWT review token (long, used in email links — has signed claims)
//   • a raw UUID request_id (short, used in SMS links — keeps SMS body < 320 chars)
// In both cases we resolve the review_request row, then mint a fresh JWT
// server-side and hand it to ReviewClient so the downstream API calls
// (generate / track / unsubscribe) keep using JWT verification unchanged.
//
// Other /review/<static> routes (existing AI Review Assistant) win via
// Next.js static-over-dynamic routing precedence.
import { randomUUID } from 'node:crypto'
import { notFound } from 'next/navigation'
import { mintReviewToken, verifyReviewToken } from '@/lib/review/tokens'
import { createAdminClient } from '@/lib/supabase/admin'
import { logFunnelEvent } from '@/lib/review/events'
import ReviewClient from './ReviewClient'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TOKEN_EXPIRES_IN_DAYS = 14

interface PageProps {
  params: Promise<{ token: string }>
}

export default async function ReviewPage({ params }: PageProps) {
  const { token } = await params

  // Resolve {requestId, clinicId} from either a UUID or a JWT.
  let requestId: string
  let clinicId: string

  if (UUID_RE.test(token)) {
    // Short link path: token is the request_id. Look up the row.
    // createAdminClient returns an untyped Supabase client (no generated schema yet).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createAdminClient() as any
    const { data } = await supabase
      .from('review_requests')
      .select('id, clinic_id, status, expires_at')
      .eq('id', token)
      .single()
    if (!data) notFound()
    const shortRow = data as { id: string; clinic_id: string; status: string; expires_at: string }
    if (shortRow.status === 'revoked' || shortRow.status === 'expired') notFound()
    if (new Date(shortRow.expires_at) < new Date()) notFound()
    requestId = shortRow.id
    clinicId = shortRow.clinic_id
  } else {
    // Long link path: JWT-verify.
    const decoded = await verifyReviewToken(token)
    if (!decoded) notFound()
    requestId = decoded.requestId
    clinicId = decoded.clinicId
  }

  // createAdminClient returns an untyped Supabase client (no generated schema yet).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  interface ReviewRequestPageRow {
    id: string
    patient_name: string
    therapist_name: string | null
    service_type: string | null
    clinics: { name: string; google_place_id: string | null; google_maps_url: string | null }
  }

  const { data: row } = await supabase
    .from('review_requests')
    .select(
      'id, patient_name, therapist_name, service_type, clinics!inner(name, google_place_id, google_maps_url)',
    )
    .eq('id', requestId)
    .single()
  if (!row) notFound()
  const typedRow = row as ReviewRequestPageRow

  // First visit only — logFunnelEvent dedupes link_clicked per request.
  await logFunnelEvent(supabase, { requestId, eventType: 'link_clicked' })

  const clinic = typedRow.clinics
  const mapsHref = clinic.google_place_id
    ? `https://search.google.com/local/writereview?placeid=${encodeURIComponent(clinic.google_place_id)}`
    : (clinic.google_maps_url ?? '#')

  // Always hand ReviewClient a fresh JWT so /api/review-requests/* keeps
  // working unchanged. The JWT is bound to this same request_id.
  const jwt = await mintReviewToken({
    requestId,
    clinicId,
    jti: randomUUID(),
    expiresInDays: TOKEN_EXPIRES_IN_DAYS,
  })

  return (
    <ReviewClient
      token={jwt}
      patientName={typedRow.patient_name}
      clinicName={clinic.name}
      mapsHref={mapsHref}
    />
  )
}
