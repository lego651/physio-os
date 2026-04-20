import { z } from 'zod'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isWidgetEnabled } from '@/lib/widget/kill-switch'
import { isAllowedOrigin, getAllowedOrigins } from '@/lib/widget/origin'
import { checkWidgetRateLimit, hashIp } from '@/lib/widget/rate-limit'
import { verifySessionToken } from '@/lib/widget/session-token'
import { sendLeadNotification } from '@/lib/email/send-lead-notification'
import { WIDGET_MESSAGES as M } from '@/lib/widget/constants'

export const runtime = 'nodejs'

const schema = z.object({
  token: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().trim().max(30).optional(),
  interest: z.string().trim().max(500).optional(),
  consentGiven: z.literal(true),
  consentText: z.string().min(1).max(1000),
})

export async function POST(req: Request) {
  if (!isWidgetEnabled()) return NextResponse.json({ error: M.DISABLED }, { status: 503 })

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '0.0.0.0'
  const ipHash = hashIp(ip)
  const rl = await checkWidgetRateLimit(ipHash)
  if (!rl.allowed) return NextResponse.json({ error: M.RATE_LIMITED }, { status: 429 })

  const parsed = schema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: 'Bad request', issues: parsed.error.flatten() }, { status: 400 })
  const d = parsed.data
  if (!d.email && !d.phone) return NextResponse.json({ error: 'Email or phone required' }, { status: 400 })

  const session = await verifySessionToken(d.token)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.iph !== ipHash) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const conversationId = session.cid
  const clinicSlug = session.clinic

  const supabase = createAdminClient()
  const { data: clinic } = await supabase
    .from('clinics').select('id, name, domain').eq('slug', clinicSlug).single()
  if (!clinic) return NextResponse.json({ error: 'Unknown clinic' }, { status: 404 })

  const origin = req.headers.get('origin')
  if (!isAllowedOrigin(origin, getAllowedOrigins(clinic.domain))) {
    return NextResponse.json({ error: M.FORBIDDEN_ORIGIN }, { status: 403 })
  }

  // Bot-abuse guard: require a real conversation before accepting a lead.
  const { count: userMsgCount } = await supabase
    .from('widget_messages')
    .select('*', { count: 'exact', head: true })
    .eq('conversation_id', conversationId)
    .eq('role', 'user')
  if ((userMsgCount ?? 0) < 2) {
    return NextResponse.json({ error: 'Please chat with us a bit more before leaving your contact.' }, { status: 400 })
  }

  const { data: lead, error } = await supabase
    .from('widget_leads').insert({
      conversation_id: conversationId, clinic_id: clinic.id,
      name: d.name, email: d.email || null, phone: d.phone || null, interest: d.interest || null,
      consent_given: d.consentGiven, consent_text: d.consentText,
    }).select('id, created_at').single()
  if (error || !lead) return NextResponse.json({ error: M.ERROR_GENERIC }, { status: 500 })

  // Transcript snippet
  const { data: msgs } = await supabase
    .from('widget_messages').select('role, content').eq('conversation_id', conversationId)
    .order('created_at', { ascending: true }).limit(10)
  const snippet = (msgs ?? []).map(m => `${m.role}: ${m.content}`).join('\n')

  const clinicEmail = process.env.WIDGET_CLINIC_EMAIL ?? 'vhealthc@gmail.com'
  const ok = await sendLeadNotification({
    clinicName: clinic.name, clinicEmail,
    leadName: d.name, leadEmail: d.email || null, leadPhone: d.phone || null, interest: d.interest || null,
    transcriptSnippet: snippet, consentText: d.consentText, createdAt: lead.created_at,
  })
  if (ok) await supabase.from('widget_leads').update({ notified_at: new Date().toISOString() }).eq('id', lead.id)

  return NextResponse.json({ ok: true, leadId: lead.id })
}
