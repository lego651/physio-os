import { describe, it, expect, beforeEach } from 'vitest'
import { isOptedOut, recordOptOut } from '../opt-outs'

type Row = { clinic_id: string; contact: string; contact_type: 'email' | 'sms' }
let rows: Row[]

function makeSupabase() {
  return {
    from(table: string) {
      if (table !== 'review_opt_outs') throw new Error('unexpected ' + table)
      const filter: Record<string, string> = {}
      const builder = {
        select() {
          return builder
        },
        eq(col: string, val: string) {
          filter[col] = val
          return builder
        },
        async maybeSingle() {
          const found = rows.find(
            (r) =>
              r.clinic_id === filter.clinic_id &&
              r.contact === filter.contact &&
              r.contact_type === filter.contact_type,
          )
          return { data: found ?? null, error: null }
        },
        async upsert(row: Row) {
          const existing = rows.find(
            (r) =>
              r.clinic_id === row.clinic_id &&
              r.contact === row.contact &&
              r.contact_type === row.contact_type,
          )
          if (!existing) rows.push(row)
          return { data: row, error: null }
        },
      }
      return builder
    },
    // Narrow cast — mock only implements the subset of SupabaseClient used by isOptedOut/recordOptOut.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

describe('opt-outs', () => {
  beforeEach(() => {
    rows = []
  })

  it('isOptedOut returns false on empty table', async () => {
    const out = await isOptedOut(makeSupabase(), {
      clinicId: 'c1',
      contact: 'a@b.com',
      contactType: 'email',
    })
    expect(out).toBe(false)
  })

  it('isOptedOut returns true after recordOptOut', async () => {
    const supabase = makeSupabase()
    await recordOptOut(supabase, {
      clinicId: 'c1',
      contact: 'a@b.com',
      contactType: 'email',
      source: 'email_link',
    })
    const out = await isOptedOut(supabase, {
      clinicId: 'c1',
      contact: 'a@b.com',
      contactType: 'email',
    })
    expect(out).toBe(true)
  })

  it('recordOptOut is idempotent', async () => {
    const supabase = makeSupabase()
    await recordOptOut(supabase, {
      clinicId: 'c1',
      contact: 'a@b.com',
      contactType: 'email',
      source: 'email_link',
    })
    await recordOptOut(supabase, {
      clinicId: 'c1',
      contact: 'a@b.com',
      contactType: 'email',
      source: 'email_link',
    })
    expect(rows).toHaveLength(1)
  })
})
