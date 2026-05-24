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
    vi.clearAllMocks()
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

    vi.mocked(generateText).mockResolvedValueOnce({
      output: { ranked_ids: ['p2', 'p1'] },
    } as never)

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

  it('uses LLM to sort multiple patients when no exact match', async () => {
    const { matchPatient } = await import('../match-patient')

    vi.mocked(generateText).mockResolvedValueOnce({
      output: { ranked_ids: ['p2', 'p1'] },
    } as never)

    const supabase = makeSupabase({
      patients: [
        { id: 'p1', name: 'Jason Gao', phone: null, email: null },
        { id: 'p2', name: 'Jay Chen', phone: null, email: null },
      ],
      intakeRows: [],
    })
    const result = await matchPatient('clinic-uuid', 'Jay', supabase)
    expect(generateText).toHaveBeenCalledOnce()
    // LLM ranked p2 first
    expect(result[0]!.id).toBe('p2')
    expect(result[1]!.id).toBe('p1')
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

    vi.mocked(generateText).mockResolvedValueOnce({
      output: { ranked_ids: manyPatients.map((p) => p.id) },
    } as never)

    const supabase = makeSupabase({ patients: manyPatients, intakeRows: [] })
    const result = await matchPatient('clinic-uuid', 'Patient', supabase)
    expect(result.length).toBeLessThanOrEqual(10)
  })
})
