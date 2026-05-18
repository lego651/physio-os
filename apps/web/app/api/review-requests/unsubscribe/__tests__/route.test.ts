import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/review/tokens', () => ({ verifyReviewToken: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      if (table === 'review_requests') {
        return {
          select() { return this },
          eq() { return this },
          async single() {
            return {
              data: { id: 'r1', patient_email: 'a@b.com', patient_phone: null, clinic_id: 'c1' },
              error: null,
            }
          },
          // Partial mock — only implements the subset used by doUnsubscribe.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return {} as any
    },
  }),
}))
const recordOptOut = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/review/opt-outs', () => ({
  recordOptOut: (...args: unknown[]) => recordOptOut(...args),
}))

import { GET, POST } from '../route'
import { verifyReviewToken } from '@/lib/review/tokens'

describe('/api/review-requests/unsubscribe', () => {
  beforeEach(() => {
    recordOptOut.mockClear()
    vi.mocked(verifyReviewToken).mockResolvedValue({ requestId: 'r1', clinicId: 'c1', jti: 'j1' })
  })

  it('GET 302-redirects to /review/[token]/unsubscribed on success', async () => {
    const res = await GET(new Request('http://x/api/review-requests/unsubscribe?token=tok'))
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toMatch(/\/unsubscribed/)
    expect(recordOptOut).toHaveBeenCalledOnce()
  })

  it('GET 401 on invalid token', async () => {
    vi.mocked(verifyReviewToken).mockResolvedValue(null)
    const res = await GET(new Request('http://x/api/review-requests/unsubscribe?token=bad'))
    expect(res.status).toBe(401)
  })

  it('POST returns JSON ok on success', async () => {
    const res = await POST(
      new Request('http://x', {
        method: 'POST',
        body: JSON.stringify({ token: 'tok' }),
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
  })
})
