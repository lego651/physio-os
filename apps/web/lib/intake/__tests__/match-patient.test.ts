import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@physio-os/shared'

// Mock the AI SDK — we don't want real LLM calls in unit tests
vi.mock('ai', () => ({
  generateText: vi.fn(),
  Output: {
    object: vi.fn(({ schema }) => ({ schema })),
  },
}))
vi.mock('@ai-sdk/anthropic', () => ({
  anthropic: vi.fn(() => 'mocked-haiku-model'),
}))

import { generateText } from 'ai'

// Helper: build the LLM filter response shape { matches: [{patient_id, reason}] }
function llmMatches(ids: string[]) {
  return {
    output: {
      matches: ids.map((id) => ({ patient_id: id, reason: 'phonetic match' })),
    },
  } as never
}

// Helper to build a minimal mock Supabase client for patients + intake_records
function makeSupabase(opts: {
  patients?: Array<{ id: string; name: string; phone: string | null; email: string | null }>
  intakeRows?: Array<{ patient_id: string; date_of_visit: string }>
}): SupabaseClient<Database> {
  const { patients = [], intakeRows = [] } = opts

  const fromImpl = (table: string) => {
    if (table === 'patients') {
      return {
        select: () => ({
          eq: () => ({
            order: () =>
              Promise.resolve({ data: patients, error: null }),
          }),
        }),
      }
    }
    if (table === 'intake_records') {
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () =>
                Promise.resolve({
                  data: intakeRows,
                  error: null,
                }),
            }),
          }),
        }),
      }
    }
    throw new Error(`Unexpected table: ${table}`)
  }

  return { from: fromImpl } as unknown as SupabaseClient<Database>
}

describe('matchPatient', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('returns [] when patient list is empty', async () => {
    const { matchPatient } = await import('../match-patient')
    const supabase = makeSupabase({ patients: [] })
    const result = await matchPatient('clinic-uuid', 'Jason', supabase)
    expect(result).toEqual([])
  })

  it('returns the single patient directly without LLM when only one patient exists', async () => {
    const { matchPatient } = await import('../match-patient')
    const supabase = makeSupabase({
      patients: [{ id: 'p1', name: 'Jason Gao', phone: null, email: 'jason@gmail.com' }],
      intakeRows: [],
    })
    const result = await matchPatient('clinic-uuid', 'Jason', supabase)
    expect(generateText).not.toHaveBeenCalled()
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('p1')
  })

  it('puts exact case-insensitive name match first before LLM results', async () => {
    const { matchPatient } = await import('../match-patient')

    // LLM filter: only returns p2 as similar (p1 was exact-matched, excluded from LLM input)
    vi.mocked(generateText).mockResolvedValueOnce(llmMatches(['p2']))

    const supabase = makeSupabase({
      patients: [
        { id: 'p1', name: 'JASON GAO', phone: null, email: null },
        { id: 'p2', name: 'Jason Smith', phone: null, email: null },
      ],
      intakeRows: [],
    })
    // Input "jason gao" matches p1 exactly (case-insensitive)
    const result = await matchPatient('clinic-uuid', 'jason gao', supabase)
    // p1 must be first regardless of LLM ranking
    expect(result[0]!.id).toBe('p1')
  })

  it('uses LLM to filter and rank multiple patients when no exact match', async () => {
    const { matchPatient } = await import('../match-patient')

    // LLM filters: only p2 is phonetically similar to "Jay"
    vi.mocked(generateText).mockResolvedValueOnce(llmMatches(['p2']))

    const supabase = makeSupabase({
      patients: [
        { id: 'p1', name: 'Jason Gao', phone: null, email: null },
        { id: 'p2', name: 'Jay Chen', phone: null, email: null },
      ],
      intakeRows: [],
    })
    const result = await matchPatient('clinic-uuid', 'Jay', supabase)
    expect(generateText).toHaveBeenCalledOnce()
    // LLM filtered: only p2 returned
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('p2')
  })

  // ── NEW: similarity filter tests ──────────────────────────────────────────

  it('does NOT return dissimilar patients — "Ethan Liu" input excludes "Jason Gao"', async () => {
    const { matchPatient } = await import('../match-patient')

    // LLM filter: only Ethan Liu is similar; Jason Gao is excluded
    vi.mocked(generateText).mockResolvedValueOnce(llmMatches(['p1']))

    const supabase = makeSupabase({
      patients: [
        { id: 'p1', name: 'Ethan Liu', phone: null, email: null },
        { id: 'p2', name: 'Jason Gao', phone: null, email: null },
      ],
      intakeRows: [],
    })
    const result = await matchPatient('clinic-uuid', 'Ethan Liu', supabase)
    expect(result.map((c) => c.id)).toEqual(['p1'])
    expect(result.find((c) => c.id === 'p2')).toBeUndefined()
  })

  it('returns phonetically similar patient — "Eason" maps to "Ethan Liu"', async () => {
    const { matchPatient } = await import('../match-patient')

    vi.mocked(generateText).mockResolvedValueOnce(llmMatches(['p1']))

    const supabase = makeSupabase({
      patients: [
        { id: 'p1', name: 'Ethan Liu', phone: null, email: null },
        { id: 'p2', name: 'Mary Smith', phone: null, email: null },
      ],
      intakeRows: [],
    })
    const result = await matchPatient('clinic-uuid', 'Eason', supabase)
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('p1')
  })

  it('returns phonetically similar patient — "Ethaniel" maps to "Ethan Liu" (single-patient fast path)', async () => {
    const { matchPatient } = await import('../match-patient')

    // No mock needed: single patient → fast path, LLM skipped entirely
    const supabase = makeSupabase({
      patients: [
        { id: 'p1', name: 'Ethan Liu', phone: null, email: null },
      ],
      intakeRows: [],
    })
    const result = await matchPatient('clinic-uuid', 'Ethaniel', supabase)
    expect(generateText).not.toHaveBeenCalled()
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('p1')
  })

  it('returns [] when LLM finds no phonetically similar patients', async () => {
    const { matchPatient } = await import('../match-patient')

    // LLM returns empty — no matches
    vi.mocked(generateText).mockResolvedValueOnce(llmMatches([]))

    const supabase = makeSupabase({
      patients: [
        { id: 'p1', name: 'Mary Jones', phone: null, email: null },
        { id: 'p2', name: 'Bob Wilson', phone: null, email: null },
      ],
      intakeRows: [],
    })
    const result = await matchPatient('clinic-uuid', 'John Smith', supabase)
    expect(result).toEqual([])
  })

  it('returns phonetic variant — "Niu" input matches "Liu" patient (LLM decides)', async () => {
    const { matchPatient } = await import('../match-patient')

    vi.mocked(generateText).mockResolvedValueOnce(llmMatches(['p1']))

    const supabase = makeSupabase({
      patients: [
        { id: 'p1', name: 'Ethan Liu', phone: null, email: null },
        { id: 'p2', name: 'Mark Wong', phone: null, email: null },
      ],
      intakeRows: [],
    })
    const result = await matchPatient('clinic-uuid', 'Ethan Niu', supabase)
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('p1')
  })

  it('masks phone — only last 4 digits with ellipsis prefix', async () => {
    const { matchPatient } = await import('../match-patient')
    const supabase = makeSupabase({
      patients: [{ id: 'p1', name: 'Ethan Liu', phone: '+14035552134', email: null }],
      intakeRows: [],
    })
    const result = await matchPatient('clinic-uuid', 'Ethan Liu', supabase)
    expect(result[0]!.phone_suffix4).toBe('…2134')
  })

  it('returns null phone_suffix4 when phone is null', async () => {
    const { matchPatient } = await import('../match-patient')
    const supabase = makeSupabase({
      patients: [{ id: 'p1', name: 'Jason Gao', phone: null, email: 'jason@gmail.com' }],
      intakeRows: [],
    })
    const result = await matchPatient('clinic-uuid', 'Jason Gao', supabase)
    expect(result[0]!.phone_suffix4).toBeNull()
  })

  it('masks email — first 3 chars + "..." + @domain', async () => {
    const { matchPatient } = await import('../match-patient')
    const supabase = makeSupabase({
      patients: [{ id: 'p1', name: 'Jason Gao', phone: null, email: 'jasonusca@gmail.com' }],
      intakeRows: [],
    })
    const result = await matchPatient('clinic-uuid', 'Jason Gao', supabase)
    expect(result[0]!.email_partial).toBe('jas...@gmail.com')
  })

  it('returns null email_partial when email is null', async () => {
    const { matchPatient } = await import('../match-patient')
    const supabase = makeSupabase({
      patients: [{ id: 'p1', name: 'Ethan Liu', phone: '+14035552134', email: null }],
      intakeRows: [],
    })
    const result = await matchPatient('clinic-uuid', 'Ethan Liu', supabase)
    expect(result[0]!.email_partial).toBeNull()
  })

  it('populates last_seen_at from the most recent intake_records date_of_visit', async () => {
    const { matchPatient } = await import('../match-patient')
    const supabase = makeSupabase({
      patients: [{ id: 'p1', name: 'Jason Gao', phone: null, email: 'jason@gmail.com' }],
      intakeRows: [{ patient_id: 'p1', date_of_visit: '2026-04-15' }],
    })
    const result = await matchPatient('clinic-uuid', 'Jason Gao', supabase)
    expect(result[0]!.last_seen_at).toBe('2026-04-15')
  })

  it('sets last_seen_at to null when no intake records exist for patient', async () => {
    const { matchPatient } = await import('../match-patient')
    const supabase = makeSupabase({
      patients: [{ id: 'p1', name: 'Jason Gao', phone: null, email: 'jason@gmail.com' }],
      intakeRows: [],
    })
    const result = await matchPatient('clinic-uuid', 'Jason Gao', supabase)
    expect(result[0]!.last_seen_at).toBeNull()
  })

  it('returns at most 10 candidates', async () => {
    const { matchPatient } = await import('../match-patient')

    const manyPatients = Array.from({ length: 15 }, (_, i) => ({
      id: `p${i}`,
      name: `Patient ${i}`,
      phone: null,
      email: null,
    }))

    vi.mocked(generateText).mockResolvedValueOnce(llmMatches(manyPatients.map((p) => p.id)))

    const supabase = makeSupabase({ patients: manyPatients, intakeRows: [] })
    const result = await matchPatient('clinic-uuid', 'Patient', supabase)
    expect(result.length).toBeLessThanOrEqual(10)
  })
})
