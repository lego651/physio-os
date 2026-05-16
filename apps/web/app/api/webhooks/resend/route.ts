// apps/web/app/api/webhooks/resend/route.ts
import { createHmac, timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { logFunnelEvent } from '@/lib/review/events'

export const runtime = 'nodejs'

const TRACKED_EVENTS: Record<string, 'email_delivered' | 'email_opened'> = {
  'email.delivered': 'email_delivered',
  'email.opened': 'email_opened',
}

function verifySignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret || !header) return false
  const expected = `v1=${createHmac('sha256', secret).update(rawBody).digest('hex')}`
  const a = Buffer.from(expected)
  const b = Buffer.from(header)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export async function POST(req: Request) {
  const raw = await req.text()
  const sig = req.headers.get('resend-signature')
  if (!verifySignature(raw, sig)) {
    return Response.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let body: any
  try { body = JSON.parse(raw) }
  catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const eventType = TRACKED_EVENTS[body?.type]
  if (!eventType) return Response.json({ ok: true, ignored: true })

  const providerMessageId = body?.data?.email_id
  if (!providerMessageId) return Response.json({ ok: true, missing: 'email_id' })

  const supabase = createAdminClient()

  // Match by sent_email event metadata.provider_message_id.
  const { data: ev } = await supabase
    .from('review_funnel_events')
    .select('request_id')
    .eq('event_type', 'sent_email')
    .eq('metadata->>provider_message_id', providerMessageId)
    .maybeSingle()

  let requestId = (ev as any)?.request_id ?? null

  // Optional X-header fallback (in case Resend ever forwards a tracking header).
  if (!requestId) {
    const headerRid = body?.data?.headers?.['X-Review-Request-Id']
    if (headerRid) {
      const { data: row } = await supabase
        .from('review_requests')
        .select('id')
        .eq('id', headerRid)
        .maybeSingle()
      requestId = (row as any)?.id ?? null
    }
  }

  if (!requestId) return Response.json({ ok: true, unmatched: true })

  await logFunnelEvent(supabase, {
    requestId, eventType,
    metadata: { provider_message_id: providerMessageId },
  })

  return Response.json({ ok: true })
}
