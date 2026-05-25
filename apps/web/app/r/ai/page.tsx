// apps/web/app/r/ai/page.tsx
//
// SSR page for the AI-assisted review flow.
// Validates token_jti, records click, pre-generates draft, renders AiReviewClient.

import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { createAnthropic } from '@ai-sdk/anthropic'
import { generateText } from 'ai'
import AiReviewClient from './AiReviewClient'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const GOOGLE_FALLBACK = 'https://www.google.com/maps/place/V-Health+Rehab/'

const VARIATION_HINTS = [
  'Be concise and warm.',
  'Lead with the outcome.',
  'Start with how you felt walking in.',
]

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function AiReviewPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const t = typeof sp.t === 'string' ? sp.t : null
  if (!t) notFound()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  interface AiReviewRow {
    id: string
    status: string
    expires_at: string
    patient_name: string
    therapist_name: string | null
    service_type: string | null
    session_notes: string | null
    // Left join (no !inner) — clinics may be null if the FK row is missing.
    // All clinic fields are accessed with optional chaining + fallbacks below.
    clinics: { name: string; google_maps_url: string | null; google_place_id: string | null } | null
  }

  const { data: row } = await supabase
    .from('review_requests')
    .select('id, status, expires_at, patient_name, therapist_name, service_type, session_notes, clinics(name, google_maps_url, google_place_id)')
    .eq('token_jti', t)
    .single()

  if (!row) notFound()
  const typedRow = row as AiReviewRow

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

  // Guard all clinic fields — left join means clinics may be null
  const clinicName = typedRow.clinics?.name ?? 'V-Health Rehab Clinic'
  const therapistName = typedRow.therapist_name ?? 'the therapist'
  const service = typedRow.service_type ?? 'treatment'
  const notes = typedRow.session_notes ?? 'none'
  const variationHint = VARIATION_HINTS[Math.floor(Math.random() * VARIATION_HINTS.length)]

  const prompt = [
    `You are writing a Google Maps review on behalf of a patient who just visited ${clinicName}.`,
    ``,
    `Therapist: ${therapistName}`,
    `Service: ${service}`,
    `Patient hint (if provided): ${notes}`,
    ``,
    `Write a 60-90 word warm, authentic-sounding review. First person. Mention the therapist by name. Mention what they came in for. Sound human, not corporate. No emojis. Output the review text only, no preamble.`,
    ``,
    `Style hint: ${variationHint}`,
  ].join('\n')

  const apiKey = process.env.ANTHROPIC_API_KEY_WIDGET ?? process.env.ANTHROPIC_API_KEY
  let initialDraft = 'I recently visited V-Health Rehab Clinic and had a great experience. Highly recommend!'

  if (apiKey) {
    try {
      const anthropic = createAnthropic({ apiKey })
      const { text } = await generateText({
        model: anthropic('claude-haiku-4-5-20251001'),
        prompt,
        maxOutputTokens: 300,
        temperature: 0.7,
      })
      initialDraft = text.trim()
    } catch {
      // Serve page with fallback draft — don't 500 the user
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
      initialDraft={initialDraft}
      mapsUrl={mapsUrl}
    />
  )
}
