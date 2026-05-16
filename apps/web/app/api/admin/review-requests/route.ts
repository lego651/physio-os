// apps/web/app/api/admin/review-requests/route.ts
import { z } from 'zod'
import { requireAdminAuth } from '@/lib/auth/require-admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadReviewConfig } from '@/lib/review/config'
import { ReviewRequestEngine } from '@/lib/review/engine'
import { EmailAdapter } from '@/lib/review/adapters/email'
import { SmsAdapter } from '@/lib/review/adapters/sms'

export const runtime = 'nodejs'

const E164_REGEX = /^\+[1-9]\d{7,14}$/
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const bodySchema = z.object({
  clinicId: z.string().uuid(),
  patientName: z.string().trim().min(1).max(120),
  patientEmail: z.string().regex(EMAIL_REGEX).nullable().optional(),
  patientPhone: z.string().regex(E164_REGEX).nullable().optional(),
  therapistName: z.string().trim().max(120).nullable().optional(),
  serviceType: z.string().trim().min(1).max(60),
  channel: z.enum(['email', 'sms', 'both']),
  consentConfirmed: z.literal(true),
}).superRefine((v, ctx) => {
  if ((v.channel === 'email' || v.channel === 'both') && !v.patientEmail) {
    ctx.addIssue({ code: 'custom', message: 'patientEmail required for email channel', path: ['patientEmail'] })
  }
  if ((v.channel === 'sms' || v.channel === 'both') && !v.patientPhone) {
    ctx.addIssue({ code: 'custom', message: 'patientPhone required for sms channel', path: ['patientPhone'] })
  }
})

export async function POST(req: Request) {
  const auth = await requireAdminAuth()
  if (auth.error) return auth.error

  let raw: unknown
  try { raw = await req.json() }
  catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }) }

  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return Response.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 })
  }

  const supabase = createAdminClient()
  const config = loadReviewConfig()
  const engine = new ReviewRequestEngine({
    supabase, email: new EmailAdapter(), sms: new SmsAdapter(), config,
  })

  try {
    const out = await engine.create({
      clinicId: parsed.data.clinicId,
      patientName: parsed.data.patientName,
      patientEmail: parsed.data.patientEmail ?? null,
      patientPhone: parsed.data.patientPhone ?? null,
      therapistName: parsed.data.therapistName ?? null,
      serviceType: parsed.data.serviceType,
      channel: parsed.data.channel,
      consentConfirmed: true,
      createdBy: (auth.user as any)?.id,
    })
    return Response.json({ id: out.id, token: out.token })
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 })
  }
}

export async function GET(_req: Request) {
  const auth = await requireAdminAuth()
  if (auth.error) return auth.error

  const supabase = createAdminClient() as any
  const { data: requests, error: reqErr } = await supabase
    .from('review_requests')
    .select('id, patient_name, patient_email, patient_phone, therapist_name, service_type, channel, status, verified_at, created_at')
    .order('created_at', { ascending: false })
    .limit(50)
  if (reqErr) return Response.json({ error: reqErr.message }, { status: 500 })

  const ids = ((requests as any[]) ?? []).map(r => r.id)
  let events: any[] = []
  if (ids.length > 0) {
    const { data, error: evErr } = await supabase
      .from('review_funnel_events')
      .select('request_id, event_type, occurred_at, metadata')
      .in('request_id', ids)
    if (evErr) return Response.json({ error: evErr.message }, { status: 500 })
    events = data ?? []
  }

  const byRequest = new Map<string, any[]>()
  for (const e of events) {
    const arr = byRequest.get(e.request_id) ?? []
    arr.push(e); byRequest.set(e.request_id, arr)
  }

  return Response.json({
    requests: ((requests as any[]) ?? []).map(r => ({ ...r, events: byRequest.get(r.id) ?? [] })),
  })
}
