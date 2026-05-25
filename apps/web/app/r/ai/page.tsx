// apps/web/app/r/ai/page.tsx
//
// SSR page for the AI-assisted review flow.
// Validates token_jti, records click, extracts dynamic chips from intake_records,
// renders AiReviewClient. No pre-generated draft — AI is invoked on client demand only.

import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import AiReviewClient from './AiReviewClient'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const GOOGLE_FALLBACK = 'https://www.google.com/maps/place/V-Health+Rehab/'

// Human-readable labels for session_type enum values
const SESSION_TYPE_LABELS: Record<string, string> = {
  massage: 'Massage',
  physio: 'Physiotherapy',
  acupuncture: 'Acupuncture',
  chiropractor: 'Chiropractic',
  other: '',
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function AiReviewPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const t = typeof sp.t === 'string' ? sp.t : null
  if (!t) notFound()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  interface ReviewRequestRow {
    id: string
    status: string
    expires_at: string
    patient_name: string
    intake_record_id: string | null
    // Left join (no !inner) — clinics may be null if the FK row is missing.
    clinics: { name: string; google_maps_url: string | null; google_place_id: string | null } | null
  }

  const { data: row } = await supabase
    .from('review_requests')
    .select('id, status, expires_at, patient_name, intake_record_id, clinics(name, google_maps_url, google_place_id)')
    .eq('token_jti', t)
    .single()

  if (!row) notFound()
  const typedRow = row as ReviewRequestRow

  if (
    typedRow.status === 'revoked' ||
    typedRow.status === 'expired' ||
    new Date(typedRow.expires_at) < new Date()
  ) notFound()

  // Record click — best-effort, do not block page render on failure
  await supabase
    .from('review_requests')
    .update({ clicked_at: new Date().toISOString(), clicked_channel: 'ai' })
    .eq('id', typedRow.id)

  // Fetch dynamic chips from intake_record if linked
  let dynamicChips: string[] = []

  if (typedRow.intake_record_id) {
    interface IntakeRow {
      therapist_name: string
      treatment_area: string
      session_type: string
    }
    const { data: intake } = await supabase
      .from('intake_records')
      .select('therapist_name, treatment_area, session_type')
      .eq('id', typedRow.intake_record_id)
      .single()

    if (intake) {
      const ir = intake as IntakeRow
      const chips: string[] = []
      if (ir.therapist_name) chips.push(ir.therapist_name)
      if (ir.treatment_area) chips.push(ir.treatment_area)
      const sessionLabel = SESSION_TYPE_LABELS[ir.session_type] ?? ''
      if (sessionLabel) chips.push(sessionLabel)
      // Cap at 3 dynamic chips; filter duplicates
      dynamicChips = [...new Set(chips)].slice(0, 3)
    }
  }

  const mapsUrl =
    process.env.VHEALTH_GOOGLE_REVIEW_URL ??
    (typedRow.clinics?.google_place_id
      ? `https://search.google.com/local/writereview?placeid=${encodeURIComponent(typedRow.clinics.google_place_id)}`
      : (typedRow.clinics?.google_maps_url ?? GOOGLE_FALLBACK))

  const firstName = typedRow.patient_name.split(/\s+/)[0] ?? 'there'

  return (
    <AiReviewClient
      token={t}
      firstName={firstName}
      dynamicChips={dynamicChips}
      mapsUrl={mapsUrl}
    />
  )
}
