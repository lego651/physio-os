// apps/web/app/api/widget/session/route.ts
import { z } from 'zod'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isWidgetEnabled } from '@/lib/widget/kill-switch'
import { getAllowedOrigins, isAllowedOrigin } from '@/lib/widget/origin'
import { verifyTurnstile } from '@/lib/widget/turnstile'
import { checkWidgetRateLimit, hashIp } from '@/lib/widget/rate-limit'
import { signSessionToken } from '@/lib/widget/session-token'
import { WIDGET_MESSAGES as M } from '@/lib/widget/constants'

export const runtime = 'nodejs'
export const maxDuration = 10

const bodySchema = z.object({
  clinicSlug: z.string().min(1),
  turnstileToken: z.string().min(1),
})

export async function POST(req: Request) {
  if (!isWidgetEnabled()) return NextResponse.json({ error: M.DISABLED }, { status: 503 })

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '0.0.0.0'
  const ipHash = hashIp(ip)

  const rl = await checkWidgetRateLimit(ipHash)
  if (!rl.allowed) return NextResponse.json({ error: M.RATE_LIMITED }, { status: 429 })

  const body = bodySchema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 })

  const supabase = createAdminClient()
  const { data: clinic } = await supabase
    .from('clinics').select('id, domain').eq('slug', body.data.clinicSlug).eq('is_active', true).single()
  if (!clinic) return NextResponse.json({ error: 'Unknown clinic' }, { status: 404 })

  const origin = req.headers.get('origin')
  if (!isAllowedOrigin(origin, getAllowedOrigins(clinic.domain))) {
    return NextResponse.json({ error: M.FORBIDDEN_ORIGIN }, { status: 403 })
  }

  const ok = await verifyTurnstile(body.data.turnstileToken, ip)
  if (!ok) return NextResponse.json({ error: M.TURNSTILE_FAILED }, { status: 403 })

  const sessionId = crypto.randomUUID()
  const { data: conv, error } = await supabase
    .from('widget_conversations')
    .insert({
      clinic_id: clinic.id,
      session_id: sessionId,
      visitor_ip_hash: ipHash,
      user_agent: req.headers.get('user-agent'),
      referer: req.headers.get('referer'),
    })
    .select('id, session_id')
    .single()
  if (error || !conv) return NextResponse.json({ error: M.ERROR_GENERIC }, { status: 500 })

  // Best-effort: bump today's conversations_count rollup. Non-blocking.
  const today = new Date().toISOString().slice(0, 10)
  await supabase
    .rpc('widget_conversation_started', { p_clinic_id: clinic.id, p_date: today })

  let token: string
  try {
    token = await signSessionToken({ cid: conv.id, clinic: body.data.clinicSlug, iph: ipHash })
  } catch {
    return NextResponse.json({ error: M.ERROR_GENERIC }, { status: 500 })
  }

  return NextResponse.json({ conversationId: conv.id, sessionId: conv.session_id, token })
}
