// apps/web/app/api/review/draft/route.ts
//
// POST { token, notes? } → { draft }
// token = review_requests.token_jti (UUID from SMS link ?t= param)
// Generates a pre-written 60-90 word review using Claude Haiku.

import { z } from 'zod'
import { createAnthropic } from '@ai-sdk/anthropic'
import { generateText } from 'ai'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const maxDuration = 30

const bodySchema = z.object({
  token: z.string().min(1),
  notes: z.string().max(500).optional(),
})

// Random variation hint appended to prompt so successive calls produce different output.
const VARIATION_HINTS = [
  'Be concise and warm.',
  'Lead with the outcome.',
  'Start with how you felt walking in.',
  'Mention how quickly you noticed improvement.',
  'Open with the therapist specifically.',
]

export async function POST(req: Request) {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return Response.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  interface DraftRow {
    id: string
    status: string
    expires_at: string
    patient_name: string
    therapist_name: string | null
    service_type: string | null
    clinics: { name: string } | null
  }

  const { data: row } = await supabase
    .from('review_requests')
    .select('id, status, expires_at, patient_name, therapist_name, service_type, clinics(name)')
    .eq('token_jti', parsed.data.token)
    .single()

  if (!row) return Response.json({ error: 'Not found' }, { status: 404 })
  const typedRow = row as DraftRow

  if (typedRow.status === 'revoked' || typedRow.status === 'expired') {
    return Response.json({ error: 'Request no longer active' }, { status: 410 })
  }
  if (new Date(typedRow.expires_at) < new Date()) {
    return Response.json({ error: 'Request expired' }, { status: 410 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY_WIDGET ?? process.env.ANTHROPIC_API_KEY
  if (!apiKey) return Response.json({ error: 'AI not configured' }, { status: 500 })

  const clinicName = typedRow.clinics?.name ?? 'V-Health Rehab Clinic'
  const therapistName = typedRow.therapist_name ?? 'the therapist'
  const service = typedRow.service_type ?? 'treatment'
  const notes = parsed.data.notes ?? 'none'
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

  const anthropic = createAnthropic({ apiKey })

  try {
    const { text } = await generateText({
      model: anthropic('claude-haiku-4-5-20251001'),
      prompt,
      maxOutputTokens: 300,
      temperature: 0.7,
    })
    return Response.json({ draft: text.trim() })
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 502 })
  }
}
