// apps/web/app/r/__tests__/ai-page.test.ts
//
// Tests for the /r/ai SSR page — token validation and null-clinic regression.
// Key regression: !inner join caused 404 when clinic row was missing.
// Fix: left join (no !inner) + optional chaining on clinic fields.

import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.mock calls are hoisted — use vi.hoisted() to declare mocks that must be
// accessible inside the factory AND in test assertions.
const { notFoundMock } = vi.hoisted(() => ({
  // notFound() in Next.js throws an error to halt rendering. Replicate that here
  // so the page function stops executing after notFound() is called in tests.
  notFoundMock: vi.fn().mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') }),
}))

// Mock notFound so we can assert it was called without actually throwing
vi.mock('next/navigation', () => ({
  notFound: notFoundMock,
}))

// Mock Supabase admin client
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}))

// Mock AI SDK — we don't want live Anthropic calls in unit tests
vi.mock('ai', () => ({
  generateText: vi.fn().mockResolvedValue({ text: 'A great clinic experience!' }),
}))

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn().mockReturnValue(() => 'mock-model'),
}))

// Mock AiReviewClient — it's a React client component, not relevant here
vi.mock('../ai/AiReviewClient', () => ({
  default: vi.fn().mockReturnValue(null),
}))

import { createAdminClient } from '@/lib/supabase/admin'
import AiReviewPage from '../ai/page'

const FUTURE_EXPIRY = new Date(Date.now() + 86_400_000).toISOString()
const PAST_EXPIRY = new Date(Date.now() - 1_000).toISOString()

/**
 * Build a minimal Supabase mock that returns `row` for select().eq().single()
 * and succeeds silently for update().eq().
 */
function makeSupabase(row: Record<string, unknown> | null) {
  const updateChain = { eq: vi.fn().mockResolvedValue({ error: null }) }
  const update = vi.fn().mockReturnValue(updateChain)
  const selectChain = {
    eq: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: row,
        error: row ? null : { message: 'not found' },
      }),
    }),
  }
  const select = vi.fn().mockReturnValue(selectChain)
  return {
    client: { from: vi.fn().mockReturnValue({ select, update }) },
  }
}

/** Build valid searchParams for the page */
function sp(t: string | undefined): Promise<Record<string, string | string[] | undefined>> {
  return Promise.resolve(t !== undefined ? { t } : {})
}

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.ANTHROPIC_API_KEY
  delete process.env.ANTHROPIC_API_KEY_WIDGET
  delete process.env.VHEALTH_GOOGLE_REVIEW_URL
})

/** Helper: assert notFound() was called (page throws NEXT_NOT_FOUND) */
async function expectNotFound(promise: Promise<unknown>) {
  await expect(promise).rejects.toThrow('NEXT_NOT_FOUND')
  expect(notFoundMock).toHaveBeenCalled()
}

describe('GET /r/ai — token validation', () => {
  it('calls notFound() when ?t param is missing', async () => {
    await expectNotFound(AiReviewPage({ searchParams: sp(undefined) }))
  })

  it('calls notFound() when token not found in DB', async () => {
    const { client } = makeSupabase(null)
    vi.mocked(createAdminClient).mockReturnValue(client as ReturnType<typeof createAdminClient>)
    await expectNotFound(AiReviewPage({ searchParams: sp('00000000-0000-0000-0000-000000000001') }))
  })

  it('calls notFound() when status is revoked', async () => {
    const { client } = makeSupabase({
      id: 'req-1',
      status: 'revoked',
      expires_at: FUTURE_EXPIRY,
      patient_name: 'Alice Smith',
      therapist_name: null,
      service_type: null,
      session_notes: null,
      clinics: { name: 'V-Health', google_maps_url: null, google_place_id: null },
    })
    vi.mocked(createAdminClient).mockReturnValue(client as ReturnType<typeof createAdminClient>)
    await expectNotFound(AiReviewPage({ searchParams: sp('00000000-0000-0000-0000-000000000001') }))
  })

  it('calls notFound() when token is expired by timestamp', async () => {
    const { client } = makeSupabase({
      id: 'req-1',
      status: 'sent',
      expires_at: PAST_EXPIRY,
      patient_name: 'Alice Smith',
      therapist_name: null,
      service_type: null,
      session_notes: null,
      clinics: { name: 'V-Health', google_maps_url: null, google_place_id: null },
    })
    vi.mocked(createAdminClient).mockReturnValue(client as ReturnType<typeof createAdminClient>)
    await expectNotFound(AiReviewPage({ searchParams: sp('00000000-0000-0000-0000-000000000001') }))
  })

  it('does NOT call notFound() for a valid token with a clinic row', async () => {
    const { client } = makeSupabase({
      id: 'req-1',
      status: 'sent',
      expires_at: FUTURE_EXPIRY,
      patient_name: 'Alice Smith',
      therapist_name: 'Dr. Kyle Wu',
      service_type: 'massage_therapy',
      session_notes: null,
      clinics: { name: 'V-Health Rehab Clinic', google_maps_url: null, google_place_id: null },
    })
    vi.mocked(createAdminClient).mockReturnValue(client as ReturnType<typeof createAdminClient>)
    await AiReviewPage({ searchParams: sp('00000000-0000-0000-0000-000000000001') })
    expect(notFoundMock).not.toHaveBeenCalled()
  })
})

describe('GET /r/ai — null clinic regression (Bug: !inner join → 404)', () => {
  it('does NOT call notFound() when clinics is null (left join returns null clinic)', async () => {
    // This is the regression test for the !inner join bug.
    // When clinics join returns null (e.g., FK row missing or PostgREST inner join
    // filtered the row), the old code hit `if (!row) notFound()`.
    // With the left join fix, clinics=null still returns the row and the page renders
    // using the 'V-Health Rehab Clinic' fallback.
    const { client } = makeSupabase({
      id: 'req-1',
      status: 'sent',
      expires_at: FUTURE_EXPIRY,
      patient_name: 'Ethan Liu',
      therapist_name: null,
      service_type: null,
      session_notes: null,
      clinics: null, // simulates left join returning no clinic row
    })
    vi.mocked(createAdminClient).mockReturnValue(client as ReturnType<typeof createAdminClient>)
    await AiReviewPage({ searchParams: sp('07429f85-5b2f-4d92-97bf-5ca186b3651e') })
    expect(notFoundMock).not.toHaveBeenCalled()
  })

  it('renders successfully (no 404) and uses fallback clinic name when clinics is null', async () => {
    // Verify: page completes without calling notFound(). The clinic name fallback
    // ('V-Health Rehab Clinic') is used in the AI prompt internally — we verify
    // the page doesn't crash by confirming notFound was never called.
    const { client } = makeSupabase({
      id: 'req-1',
      status: 'sent',
      expires_at: FUTURE_EXPIRY,
      patient_name: 'Ethan Liu',
      therapist_name: 'Dr. Kyle Wu',
      service_type: 'massage_therapy',
      session_notes: null,
      clinics: null,
    })
    vi.mocked(createAdminClient).mockReturnValue(client as ReturnType<typeof createAdminClient>)
    // No ANTHROPIC key → uses hardcoded fallback draft, no AI call
    const result = await AiReviewPage({ searchParams: sp('07429f85-5b2f-4d92-97bf-5ca186b3651e') })
    expect(notFoundMock).not.toHaveBeenCalled()
    // Result is a React element (JSX) — just verify it's truthy (page rendered)
    expect(result).toBeTruthy()
  })
})
