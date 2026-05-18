import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/auth/require-admin', () => ({
  requireAdminAuth: vi.fn(),
}))
vi.mock('@/lib/review/engine', () => ({
  ReviewRequestEngine: class {
    async create() {
      return { id: 'req-1', token: 'tok-1' }
    }
  },
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from() {
      return {
        select() {
          return this
        },
        order() {
          return this
        },
        limit: async () => ({ data: [], error: null }),
        in: async () => ({ data: [], error: null }),
      }
    },
  }),
}))
vi.mock('@/lib/review/adapters/email', () => ({ EmailAdapter: class {} }))
vi.mock('@/lib/review/adapters/sms', () => ({ SmsAdapter: class {} }))
vi.mock('@/lib/review/config', () => ({
  loadReviewConfig: () => ({
    tokenSecret: 'a'.repeat(64),
    baseUrl: 'https://x',
    testMode: true,
    testRecipientEmail: 'j@x',
    testRecipientPhone: '+1',
    resendWebhookSecret: '',
  }),
}))

import { POST } from '../route'
import { requireAdminAuth } from '@/lib/auth/require-admin'

function makeReq(body: any): Request {
  return new Request('http://x/api/admin/review-requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/admin/review-requests', () => {
  beforeEach(() => {
    vi.mocked(requireAdminAuth).mockResolvedValue({ user: { id: 'u1', email: 'a@b' } } as any)
  })

  it('401 when not authenticated', async () => {
    vi.mocked(requireAdminAuth).mockResolvedValue({
      error: new Response('unauth', { status: 401 }),
    } as any)
    const res = await POST(makeReq({}))
    expect(res.status).toBe(401)
  })

  it('400 on invalid JSON', async () => {
    const res = await POST(new Request('http://x', { method: 'POST', body: 'not-json' }))
    expect(res.status).toBe(400)
  })

  it('400 on schema validation failure', async () => {
    const res = await POST(makeReq({ patientName: '' }))
    expect(res.status).toBe(400)
  })

  it('400 when consentConfirmed is missing or false', async () => {
    const res = await POST(
      makeReq({
        clinicId: '11111111-2222-4333-8444-555555555555',
        patientName: 'A',
        channel: 'email',
        patientEmail: 'a@b.com',
        serviceType: 'm',
        consentConfirmed: false,
      }),
    )
    expect(res.status).toBe(400)
  })

  it('200 with id + token on success', async () => {
    const res = await POST(
      makeReq({
        clinicId: '11111111-2222-4333-8444-555555555555',
        patientName: 'Alice',
        channel: 'email',
        patientEmail: 'a@b.com',
        serviceType: 'massage',
        consentConfirmed: true,
      }),
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ id: 'req-1', token: 'tok-1' })
  })
})
