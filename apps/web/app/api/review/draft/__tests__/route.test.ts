// apps/web/app/api/review/draft/__tests__/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('ai', () => ({
  generateText: vi.fn().mockResolvedValue({ text: 'Great clinic. Dr. Smith was amazing.' }),
}))
vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn().mockReturnValue(vi.fn()),
}))

import { createAdminClient } from '@/lib/supabase/admin'
import { generateText } from 'ai'
import { POST } from '../route'

function makeSupabase(row: Record<string, unknown> | null) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: row,
      error: row ? null : { message: 'not found' },
    }),
  }
  return { from: vi.fn().mockReturnValue(chain) }
}

const validRow = {
  id: 'req-1',
  status: 'sent',
  expires_at: new Date(Date.now() + 86400000).toISOString(),
  patient_name: 'Alice Chen',
  therapist_name: 'Dr. Smith',
  service_type: 'physiotherapy',
  session_notes: null,
  clinics: { name: 'V-Health Rehab Clinic' },
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.ANTHROPIC_API_KEY = 'test-key'
  vi.mocked(generateText).mockResolvedValue(
    { text: 'Great clinic. Dr. Smith was amazing.' } as Awaited<ReturnType<typeof generateText>>,
  )
})

describe('POST /api/review/draft', () => {
  it('returns 400 on missing token', async () => {
    const req = new Request('http://localhost/api/review/draft', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 404 when token not found', async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      makeSupabase(null) as unknown as ReturnType<typeof createAdminClient>,
    )
    const req = new Request('http://localhost/api/review/draft', {
      method: 'POST',
      body: JSON.stringify({ token: '00000000-0000-0000-0000-000000000001' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(404)
  })

  it('returns 410 when request is revoked', async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      makeSupabase({ ...validRow, status: 'revoked' }) as unknown as ReturnType<typeof createAdminClient>,
    )
    const req = new Request('http://localhost/api/review/draft', {
      method: 'POST',
      body: JSON.stringify({ token: '00000000-0000-0000-0000-000000000001' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(410)
  })

  it('returns { draft } on valid token with at least one keyword', async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      makeSupabase(validRow) as unknown as ReturnType<typeof createAdminClient>,
    )
    const req = new Request('http://localhost/api/review/draft', {
      method: 'POST',
      body: JSON.stringify({ token: 'some-jti-uuid', selectedFacts: ['Wendy'], selectedFeelings: [] }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.draft).toBe('Great clinic. Dr. Smith was amazing.')
  })

  it('passes legacy notes into prompt when provided via old { token, notes } format', async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      makeSupabase(validRow) as unknown as ReturnType<typeof createAdminClient>,
    )
    const req = new Request('http://localhost/api/review/draft', {
      method: 'POST',
      body: JSON.stringify({ token: 'some-jti-uuid', notes: 'neck pain got better' }),
      headers: { 'Content-Type': 'application/json' },
    })
    await POST(req)
    const callArg = vi.mocked(generateText).mock.calls[0][0]
    expect(callArg.prompt).toContain('neck pain got better')
  })

  it('prompt says "none" for customNotes when no notes given but a feeling is selected', async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      makeSupabase(validRow) as unknown as ReturnType<typeof createAdminClient>,
    )
    const req = new Request('http://localhost/api/review/draft', {
      method: 'POST',
      body: JSON.stringify({ token: 'some-jti-uuid', selectedFacts: [], selectedFeelings: ['Amazing'] }),
      headers: { 'Content-Type': 'application/json' },
    })
    await POST(req)
    const callArg = vi.mocked(generateText).mock.calls[0][0]
    expect(callArg.prompt).toContain('none')
  })
})

// ── New structured-keyword schema (Option C redesign) ─────────────────────
describe('POST /api/review/draft — structured keywords schema', () => {
  it('returns 400 when selectedFacts, selectedFeelings and customNotes are all empty', async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      makeSupabase(validRow) as unknown as ReturnType<typeof createAdminClient>,
    )
    const req = new Request('http://localhost/api/review/draft', {
      method: 'POST',
      body: JSON.stringify({ token: 'some-jti-uuid', selectedFacts: [], selectedFeelings: [], customNotes: '' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/pick at least one word/i)
  })

  it('returns 200 when only selectedFacts provided', async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      makeSupabase(validRow) as unknown as ReturnType<typeof createAdminClient>,
    )
    const req = new Request('http://localhost/api/review/draft', {
      method: 'POST',
      body: JSON.stringify({ token: 'some-jti-uuid', selectedFacts: ['Wendy'], selectedFeelings: [] }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
  })

  it('returns 200 when only selectedFeelings provided', async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      makeSupabase(validRow) as unknown as ReturnType<typeof createAdminClient>,
    )
    const req = new Request('http://localhost/api/review/draft', {
      method: 'POST',
      body: JSON.stringify({ token: 'some-jti-uuid', selectedFacts: [], selectedFeelings: ['Amazing'] }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
  })

  it('returns 200 when only customNotes provided', async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      makeSupabase(validRow) as unknown as ReturnType<typeof createAdminClient>,
    )
    const req = new Request('http://localhost/api/review/draft', {
      method: 'POST',
      body: JSON.stringify({ token: 'some-jti-uuid', selectedFacts: [], selectedFeelings: [], customNotes: 'back pain gone' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
  })

  it('includes selectedFacts in the prompt when provided', async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      makeSupabase(validRow) as unknown as ReturnType<typeof createAdminClient>,
    )
    const req = new Request('http://localhost/api/review/draft', {
      method: 'POST',
      body: JSON.stringify({ token: 'some-jti-uuid', selectedFacts: ['Wendy', 'Neck pain'], selectedFeelings: [] }),
      headers: { 'Content-Type': 'application/json' },
    })
    await POST(req)
    const callArg = vi.mocked(generateText).mock.calls[0][0]
    expect(callArg.prompt).toContain('Wendy')
    expect(callArg.prompt).toContain('Neck pain')
  })

  it('includes selectedFeelings in the prompt when provided', async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      makeSupabase(validRow) as unknown as ReturnType<typeof createAdminClient>,
    )
    const req = new Request('http://localhost/api/review/draft', {
      method: 'POST',
      body: JSON.stringify({ token: 'some-jti-uuid', selectedFacts: [], selectedFeelings: ['Amazing', 'Professional'] }),
      headers: { 'Content-Type': 'application/json' },
    })
    await POST(req)
    const callArg = vi.mocked(generateText).mock.calls[0][0]
    expect(callArg.prompt).toContain('Amazing')
    expect(callArg.prompt).toContain('Professional')
  })

  it('includes customNotes in the prompt when provided', async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      makeSupabase(validRow) as unknown as ReturnType<typeof createAdminClient>,
    )
    const req = new Request('http://localhost/api/review/draft', {
      method: 'POST',
      body: JSON.stringify({ token: 'some-jti-uuid', selectedFacts: ['Wendy'], selectedFeelings: [], customNotes: 'healed my shoulder' }),
      headers: { 'Content-Type': 'application/json' },
    })
    await POST(req)
    const callArg = vi.mocked(generateText).mock.calls[0][0]
    expect(callArg.prompt).toContain('healed my shoulder')
  })

  it('backward compat: old { token, notes } format still works (returns 200)', async () => {
    // The old client sent { token, notes }. We keep accepting this as a graceful fallback:
    // notes maps to customNotes, selectedFacts/Feelings default to [].
    // But empty notes + no facts/feelings → 400 (must pick something).
    vi.mocked(createAdminClient).mockReturnValue(
      makeSupabase(validRow) as unknown as ReturnType<typeof createAdminClient>,
    )
    const req = new Request('http://localhost/api/review/draft', {
      method: 'POST',
      body: JSON.stringify({ token: 'some-jti-uuid', notes: 'great session' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
  })
})
