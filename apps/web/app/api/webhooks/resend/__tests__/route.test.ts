import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHmac } from 'node:crypto'

let lastInsert: { request_id: string; event_type: string; metadata: unknown } | null = null

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      if (table === 'review_funnel_events') {
        return {
          select() {
            return this
          },
          eq() {
            return this
          },
          async maybeSingle() {
            return { data: { request_id: 'r1' }, error: null }
          },
          async insert(row: { request_id: string; event_type: string; metadata: unknown }) {
            lastInsert = row
            return { data: row, error: null }
          },
          // Partial mock — only implements the subset used by the webhook handler.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any
      }
      if (table === 'review_requests') {
        return {
          select() {
            return this
          },
          eq() {
            return this
          },
          async maybeSingle() {
            return { data: null, error: null }
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return {} as any
    },
  }),
}))
vi.mock('@/lib/review/events', async () => {
  return {
    IDEMPOTENT_EVENTS: ['link_clicked', 'email_opened'],
    logFunnelEvent: async (
      _supabase: unknown,
      input: { requestId: string; eventType: string; metadata?: unknown },
    ) => {
      lastInsert = {
        request_id: input.requestId,
        event_type: input.eventType,
        metadata: input.metadata ?? null,
      }
    },
  }
})

import { POST } from '../route'

const SECRET = 'whsec_test'

beforeEach(() => {
  process.env.RESEND_WEBHOOK_SECRET = SECRET
  lastInsert = null
})

function signed(body: object): Request {
  const raw = JSON.stringify(body)
  const sig = createHmac('sha256', SECRET).update(raw).digest('hex')
  return new Request('http://x/api/webhooks/resend', {
    method: 'POST',
    body: raw,
    headers: {
      'Content-Type': 'application/json',
      'resend-signature': `v1=${sig}`,
    },
  })
}

describe('POST /api/webhooks/resend', () => {
  it('rejects missing or bad signature', async () => {
    const res = await POST(new Request('http://x', { method: 'POST', body: '{}' }))
    expect(res.status).toBe(401)
  })

  it('records email_delivered event when provider id matches a review request', async () => {
    const req = signed({
      type: 'email.delivered',
      data: { email_id: 'em-1' },
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(lastInsert!.event_type).toBe('email_delivered')
  })

  it('records email_opened event', async () => {
    const req = signed({ type: 'email.opened', data: { email_id: 'em-1' } })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(lastInsert!.event_type).toBe('email_opened')
  })

  it('ignores irrelevant event types', async () => {
    const req = signed({ type: 'email.sent', data: { email_id: 'em-1' } })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(lastInsert).toBeNull()
  })
})
