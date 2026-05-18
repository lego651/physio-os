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

  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Narrow the parsed webhook payload to the fields we access.
  const payload =
    body !== null && typeof body === 'object'
      ? (body as Record<string, unknown>)
      : ({} as Record<string, unknown>)
  const payloadType = typeof payload.type === 'string' ? payload.type : ''
  const payloadData =
    payload.data !== null && typeof payload.data === 'object'
      ? (payload.data as Record<string, unknown>)
      : ({} as Record<string, unknown>)

  const eventType = TRACKED_EVENTS[payloadType]
  if (!eventType) return Response.json({ ok: true, ignored: true })

  const providerMessageId = typeof payloadData.email_id === 'string' ? payloadData.email_id : null
  if (!providerMessageId) return Response.json({ ok: true, missing: 'email_id' })

  // createAdminClient returns an untyped Supabase client (no generated schema yet).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  // Match by sent_email event metadata.provider_message_id.
  const { data: ev } = await supabase
    .from('review_funnel_events')
    .select('request_id')
    .eq('event_type', 'sent_email')
    .eq('metadata->>provider_message_id', providerMessageId)
    .maybeSingle()

  let requestId: string | null = (ev as { request_id: string } | null)?.request_id ?? null

  // Optional X-header fallback (in case Resend ever forwards a tracking header).
  if (!requestId) {
    const payloadHeaders =
      payloadData.headers !== null && typeof payloadData.headers === 'object'
        ? (payloadData.headers as Record<string, unknown>)
        : null
    const headerRid =
      payloadHeaders && typeof payloadHeaders['X-Review-Request-Id'] === 'string'
        ? payloadHeaders['X-Review-Request-Id']
        : null
    if (headerRid) {
      const { data: row } = await supabase
        .from('review_requests')
        .select('id')
        .eq('id', headerRid)
        .maybeSingle()
      requestId = (row as { id: string } | null)?.id ?? null
    }
  }

  if (!requestId) return Response.json({ ok: true, unmatched: true })

  await logFunnelEvent(supabase, {
    requestId,
    eventType,
    metadata: { provider_message_id: providerMessageId },
  })

  return Response.json({ ok: true })
}
