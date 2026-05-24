import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/auth/require-admin', () => ({
  requireAdminAuth: vi.fn(),
}))
// `engineThrows` is flipped per-test to simulate send failure.
let engineThrows = false

vi.mock('@/lib/review/engine', () => ({
  ReviewRequestEngine: class {
    async create() {
      if (engineThrows) throw new Error('Send failed: all channels failed')
      return { id: 'req-1', token: 'tok-1' }
    }
    async resend(id: string) {
      if (engineThrows) throw new Error('Send failed: sms provider_error')
      return { id, token: 'tok-resend' }
    }
  },
}))

// Dedupe mock: controlled by `mockDedupeResult` so individual tests can inject
// a "found" row to trigger the 409 branch.
let mockDedupeResult: { id: string; status: string } | null = null

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    // Build a fluent builder that resolves at .maybeSingle() for the dedupe
    // query, and falls through for the GET list query.
    const chain: Record<string, unknown> = {}
    const fluent = (): typeof chain => {
      chain.select = () => fluent()
      chain.eq = () => fluent()
      chain.in = () => fluent()
      chain.or = () => fluent()
      chain.limit = () => fluent()
      chain.maybeSingle = async () => ({ data: mockDedupeResult, error: null })
      chain.order = () => fluent()
      // GET list query resolves at limit() when called as a terminal
      const innerLimit = chain.limit
      chain.limit = (n: number) => {
        if (n === 1) return fluent() // dedupe path — continues to maybeSingle
        // list query terminal
        return Promise.resolve({ data: [], error: null })
      }
      void innerLimit // suppress unused warning
      return chain
    }
    return {
      from() {
        return fluent()
      },
    }
  },
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

function makeReq(body: unknown): Request {
  return new Request('http://x/api/admin/review-requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const BASE_CREATE = {
  clinicId: '11111111-2222-4333-8444-555555555555',
  patientName: 'Alice',
  channel: 'email',
  patientEmail: 'a@b.com',
  serviceType: 'massage',
  consentConfirmed: true,
}

describe('POST /api/admin/review-requests', () => {
  beforeEach(() => {
    mockDedupeResult = null
    engineThrows = false
    vi.mocked(requireAdminAuth).mockResolvedValue({ user: { id: 'u1', email: 'a@b' } } as Awaited<
      ReturnType<typeof requireAdminAuth>
    >)
  })

  it('401 when not authenticated', async () => {
    vi.mocked(requireAdminAuth).mockResolvedValue({
      error: new Response('unauth', { status: 401 }),
    } as Awaited<ReturnType<typeof requireAdminAuth>>)
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

  it('400 when consentConfirmed is false', async () => {
    const res = await POST(makeReq({ ...BASE_CREATE, consentConfirmed: false }))
    expect(res.status).toBe(400)
  })

  it('200 with id + token on success (no duplicate)', async () => {
    const res = await POST(makeReq(BASE_CREATE))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ id: 'req-1', token: 'tok-1' })
  })

  it('409 when a non-failed row already exists for same patient (dedupe guard)', async () => {
    mockDedupeResult = { id: 'existing-uuid', status: 'sent' }
    const res = await POST(makeReq(BASE_CREATE))
    expect(res.status).toBe(409)
    const json = await res.json()
    expect(json.error).toBe('duplicate')
    expect(json.existingId).toBe('existing-uuid')
    expect(json.existingStatus).toBe('sent')
  })

  it('409 also fires when existing row is still queued', async () => {
    mockDedupeResult = { id: 'queued-uuid', status: 'queued' }
    const res = await POST(makeReq(BASE_CREATE))
    expect(res.status).toBe(409)
    const json = await res.json()
    expect(json.existingId).toBe('queued-uuid')
  })

  it('200 when existing row is failed (failed rows do not block a new send)', async () => {
    // The dedupe query filters status IN ('queued','sent'), so failed rows
    // return null from maybeSingle — no 409 should fire.
    mockDedupeResult = null // simulate: failed row filtered out by query
    const res = await POST(makeReq(BASE_CREATE))
    expect(res.status).toBe(200)
  })

  it('200 on resend path (id present) — dedupe guard is skipped', async () => {
    // Even if mockDedupeResult is set, the resend branch exits before dedupe.
    mockDedupeResult = { id: 'should-not-matter', status: 'sent' }
    const existingId = '22222222-3333-4444-8555-666666666666'
    const res = await POST(makeReq({ id: existingId, consentConfirmed: true }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.id).toBe(existingId)
    expect(json.token).toBe('tok-resend')
  })

  // ── Error propagation (Task A) ─────────────────────────────────────────────

  it('500 when engine.resend() throws (send failure propagates to route)', async () => {
    engineThrows = true
    const existingId = '22222222-3333-4444-8555-666666666666'
    const res = await POST(makeReq({ id: existingId, consentConfirmed: true }))
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(typeof json.error).toBe('string')
    expect(json.error).toMatch(/Send failed/)
  })

  it('500 when engine.create() throws (send failure propagates to route)', async () => {
    engineThrows = true
    const res = await POST(makeReq(BASE_CREATE))
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(typeof json.error).toBe('string')
    expect(json.error).toMatch(/Send failed/)
  })

  it('200 when engine.resend() succeeds (not regressed by error-propagation fix)', async () => {
    engineThrows = false
    const existingId = '33333333-4444-5555-8666-777777777777'
    const res = await POST(makeReq({ id: existingId, consentConfirmed: true }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.id).toBe(existingId)
  })
})
