import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/review/tokens', () => ({ verifyReviewToken: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      if (table === 'review_requests') {
        return {
          select() {
            return this
          },
          eq() {
            return this
          },
          async single() {
            return {
              data: {
                id: 'r1',
                therapist_name: 'Jimmy',
                service_type: 'massage',
                status: 'queued',
                clinics: { name: 'V-Health' },
              },
              error: null,
            }
          },
        }
      }
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
        async insert(r: any) {
          return { data: r, error: null }
        },
      }
    },
  }),
}))
vi.mock('@/lib/review/events', () => ({
  logFunnelEvent: vi.fn().mockResolvedValue(undefined),
  IDEMPOTENT_EVENTS: ['link_clicked', 'email_opened'],
}))
const generateTextMock = vi.fn().mockResolvedValue({ text: 'A nice review.' })
vi.mock('ai', () => ({ generateText: (...args: any[]) => generateTextMock(...args) }))
vi.mock('@ai-sdk/anthropic', () => ({ createAnthropic: () => () => 'haiku-model' }))

import { POST } from '../route'
import { verifyReviewToken } from '@/lib/review/tokens'
import { logFunnelEvent } from '@/lib/review/events'

function req(body: any) {
  return new Request('http://x/api/review-requests/generate', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /api/review-requests/generate', () => {
  beforeEach(() => {
    vi.mocked(verifyReviewToken).mockResolvedValue({ requestId: 'r1', clinicId: 'c1', jti: 'j1' })
    generateTextMock.mockResolvedValue({ text: 'A nice review.' })
    process.env.ANTHROPIC_API_KEY_WIDGET = 'sk-test'
    vi.mocked(logFunnelEvent).mockClear()
  })

  it('401 on invalid token', async () => {
    vi.mocked(verifyReviewToken).mockResolvedValue(null)
    const res = await POST(req({ token: 'x', keywords: 'good' }))
    expect(res.status).toBe(401)
  })

  it('400 on missing keywords', async () => {
    const res = await POST(req({ token: 'x' }))
    expect(res.status).toBe(400)
  })

  it('200 with draft, logs keywords_submitted + draft_generated', async () => {
    const res = await POST(req({ token: 'tok', keywords: 'neck pain better' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.draft).toBe('A nice review.')
    const eventTypes = vi
      .mocked(logFunnelEvent)
      .mock.calls.map((c) => c[1].eventType)
      .sort()
    expect(eventTypes).toContain('keywords_submitted')
    expect(eventTypes).toContain('draft_generated')
  })
})
