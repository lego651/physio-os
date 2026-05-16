// apps/web/app/api/review-requests/generate/route.ts
//
// S2 Review Engine — JWT-protected draft generator for the post-visit
// SMS/Email flow. Distinct from /api/review/generate (the in-clinic AI
// Review Assistant — single-tenant, no auth).
import { z } from 'zod'
import { createAnthropic } from '@ai-sdk/anthropic'
import { generateText } from 'ai'
import { verifyReviewToken } from '@/lib/review/tokens'
import { createAdminClient } from '@/lib/supabase/admin'
import { logFunnelEvent } from '@/lib/review/events'
import { buildReviewPrompt } from '@/lib/review/prompts'

export const runtime = 'nodejs'
export const maxDuration = 30

const bodySchema = z.object({
  token: z.string().min(1),
  keywords: z.string().trim().min(1).max(500),
})

export async function POST(req: Request) {
  let raw: unknown
  try { raw = await req.json() }
  catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return Response.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 })
  }

  const decoded = await verifyReviewToken(parsed.data.token)
  if (!decoded) return Response.json({ error: 'Invalid or expired token' }, { status: 401 })

  const supabase = createAdminClient()

  const { data: row, error: rowErr } = await supabase
    .from('review_requests')
    .select('id, therapist_name, service_type, status, clinics!inner(name)')
    .eq('id', decoded.requestId)
    .single()
  if (rowErr || !row) return Response.json({ error: 'Request not found' }, { status: 404 })
  if ((row as any).status === 'revoked' || (row as any).status === 'expired') {
    return Response.json({ error: 'Request no longer active' }, { status: 410 })
  }

  await logFunnelEvent(supabase, { requestId: decoded.requestId, eventType: 'keywords_submitted' })

  const apiKey = process.env.ANTHROPIC_API_KEY_WIDGET
  if (!apiKey) return Response.json({ error: 'AI not configured' }, { status: 500 })

  const anthropic = createAnthropic({ apiKey })
  const prompt = buildReviewPrompt({
    clinicName: (row as any).clinics.name,
    therapistName: (row as any).therapist_name,
    serviceType: (row as any).service_type ?? 'treatment',
    keywords: parsed.data.keywords,
  })

  try {
    const { text } = await generateText({
      model: anthropic('claude-haiku-4-5-20251001'),
      prompt,
      maxTokens: 400,
      temperature: 0.7,
    })
    const draft = text.trim()
    await logFunnelEvent(supabase, {
      requestId: decoded.requestId, eventType: 'draft_generated',
      metadata: { length: draft.length },
    })
    return Response.json({ draft })
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 502 })
  }
}
