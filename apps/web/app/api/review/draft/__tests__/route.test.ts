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
      makeSupabase(null) as ReturnType<typeof createAdminClient>,
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
      makeSupabase({ ...validRow, status: 'revoked' }) as ReturnType<typeof createAdminClient>,
    )
    const req = new Request('http://localhost/api/review/draft', {
      method: 'POST',
      body: JSON.stringify({ token: '00000000-0000-0000-0000-000000000001' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(410)
  })

  it('returns { draft } on valid token', async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      makeSupabase(validRow) as ReturnType<typeof createAdminClient>,
    )
    const req = new Request('http://localhost/api/review/draft', {
      method: 'POST',
      body: JSON.stringify({ token: 'some-jti-uuid' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.draft).toBe('Great clinic. Dr. Smith was amazing.')
  })

  it('passes notes into prompt when provided', async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      makeSupabase(validRow) as ReturnType<typeof createAdminClient>,
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

  it('prompt says "none" when no notes given', async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      makeSupabase(validRow) as ReturnType<typeof createAdminClient>,
    )
    const req = new Request('http://localhost/api/review/draft', {
      method: 'POST',
      body: JSON.stringify({ token: 'some-jti-uuid' }),
      headers: { 'Content-Type': 'application/json' },
    })
    await POST(req)
    const callArg = vi.mocked(generateText).mock.calls[0][0]
    expect(callArg.prompt).toContain('none')
  })
})
