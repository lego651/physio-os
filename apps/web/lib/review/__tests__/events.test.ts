import { describe, it, expect, beforeEach } from 'vitest'
import { logFunnelEvent, IDEMPOTENT_EVENTS } from '../events'

type Row = { request_id: string; event_type: string; metadata: any }
let rows: Row[]
let inserted: Row[]

function makeSupabase() {
  inserted = []
  return {
    from(table: string) {
      if (table !== 'review_funnel_events') throw new Error('unexpected table ' + table)
      return {
        select() {
          return this
        },
        eq(col: string, val: string) {
          return { ...this, _filter: { ...(this as any)._filter, [col]: val } }
        },
        async maybeSingle() {
          const f = (this as any)._filter || {}
          const found = rows.find(
            (r) => r.request_id === f.request_id && r.event_type === f.event_type,
          )
          return { data: found ?? null, error: null }
        },
        async insert(row: Row) {
          inserted.push(row)
          rows.push(row)
          return { data: row, error: null }
        },
      }
    },
  } as any
}

describe('logFunnelEvent', () => {
  beforeEach(() => {
    rows = []
    inserted = []
  })

  it('inserts an event row', async () => {
    const supabase = makeSupabase()
    await logFunnelEvent(supabase, { requestId: 'r1', eventType: 'sent_email' })
    expect(inserted).toHaveLength(1)
    expect(inserted[0].event_type).toBe('sent_email')
  })

  it('deduplicates link_clicked per request', async () => {
    const supabase = makeSupabase()
    await logFunnelEvent(supabase, { requestId: 'r1', eventType: 'link_clicked' })
    await logFunnelEvent(supabase, { requestId: 'r1', eventType: 'link_clicked' })
    expect(inserted).toHaveLength(1)
  })

  it('does NOT deduplicate copy_clicked per request', async () => {
    const supabase = makeSupabase()
    await logFunnelEvent(supabase, { requestId: 'r1', eventType: 'copy_clicked' })
    await logFunnelEvent(supabase, { requestId: 'r1', eventType: 'copy_clicked' })
    expect(inserted).toHaveLength(2)
  })

  it('exports the canonical list of idempotent event types', () => {
    expect(IDEMPOTENT_EVENTS).toEqual(['link_clicked', 'email_opened'])
  })
})
