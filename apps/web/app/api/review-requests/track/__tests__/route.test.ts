import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/review/tokens', () => ({ verifyReviewToken: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/review/events', () => ({
  logFunnelEvent: vi.fn().mockResolvedValue(undefined),
  IDEMPOTENT_EVENTS: ['link_clicked', 'email_opened'],
}))

import { POST } from '../route'
import { verifyReviewToken } from '@/lib/review/tokens'
import { logFunnelEvent } from '@/lib/review/events'

function req(body: unknown) {
  return new Request('http://x/api/review-requests/track', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /api/review-requests/track', () => {
  beforeEach(() => {
    vi.mocked(verifyReviewToken).mockResolvedValue({ requestId: 'r1', clinicId: 'c1', jti: 'j1' })
    vi.mocked(logFunnelEvent).mockClear()
  })

  it('401 on invalid token', async () => {
    vi.mocked(verifyReviewToken).mockResolvedValue(null)
    expect((await POST(req({ token: 'x', eventType: 'link_clicked' }))).status).toBe(401)
  })

  it('400 on invalid event_type', async () => {
    expect((await POST(req({ token: 'x', eventType: 'unknown_event' }))).status).toBe(400)
  })

  it('rejects events that admin must not write (sent_email, send_failed, etc.)', async () => {
    expect((await POST(req({ token: 'x', eventType: 'sent_email' }))).status).toBe(400)
    expect((await POST(req({ token: 'x', eventType: 'email_delivered' }))).status).toBe(400)
  })

  it('200 and logs link_clicked, copy_clicked, maps_redirected', async () => {
    for (const et of ['link_clicked', 'copy_clicked', 'maps_redirected']) {
      const res = await POST(req({ token: 'tok', eventType: et }))
      expect(res.status).toBe(200)
    }
    const types = vi
      .mocked(logFunnelEvent)
      .mock.calls.map((c) => c[1].eventType)
      .sort()
    expect(types).toEqual(['copy_clicked', 'link_clicked', 'maps_redirected'])
  })
})
