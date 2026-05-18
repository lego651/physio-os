import { describe, it, expect } from 'vitest'
import { deriveFunnelStage, firstEventAt, aggregateFunnel } from '../funnel-logic'

// ─── Test helpers ─────────────────────────────────────────────────────────────

import type { FunnelEvent, ReviewRow } from '../funnel-logic'

function makeRow(overrides: Partial<ReviewRow>): ReviewRow {
  return {
    id: 'test-id',
    status: 'queued',
    events: [],
    ...overrides,
  }
}

function makeEvent(type: string, at = '2026-05-17T10:00:00Z'): FunnelEvent {
  return { event_type: type, occurred_at: at, metadata: null }
}

// ─── deriveFunnelStage ────────────────────────────────────────────────────────

describe('deriveFunnelStage', () => {
  it('returns "queued" when no events and status is not sent or failed', () => {
    expect(deriveFunnelStage(makeRow({ status: 'queued', events: [] }))).toBe('queued')
  })

  it('returns "sent" when status is "sent" and no funnel events', () => {
    expect(deriveFunnelStage(makeRow({ status: 'sent', events: [] }))).toBe('sent')
  })

  it('returns "sent" when events include a "sent" event type', () => {
    expect(deriveFunnelStage(makeRow({ events: [makeEvent('sent')] }))).toBe('sent')
  })

  it('returns "failed" when status is "failed" and no positive events', () => {
    expect(deriveFunnelStage(makeRow({ status: 'failed', events: [] }))).toBe('failed')
  })

  it('returns "opened" when email_opened event exists', () => {
    expect(
      deriveFunnelStage(makeRow({ status: 'sent', events: [makeEvent('email_opened')] })),
    ).toBe('opened')
  })

  it('returns "clicked" when link_clicked event exists (outranks opened)', () => {
    expect(
      deriveFunnelStage(
        makeRow({ status: 'sent', events: [makeEvent('email_opened'), makeEvent('link_clicked')] }),
      ),
    ).toBe('clicked')
  })

  it('returns "copied" when review_copied event exists (outranks clicked)', () => {
    expect(
      deriveFunnelStage(
        makeRow({
          status: 'sent',
          events: [makeEvent('link_clicked'), makeEvent('review_copied')],
        }),
      ),
    ).toBe('copied')
  })

  it('returns "posted" when review_posted event exists (highest priority)', () => {
    expect(
      deriveFunnelStage(
        makeRow({
          status: 'sent',
          events: [makeEvent('review_copied'), makeEvent('review_posted')],
        }),
      ),
    ).toBe('posted')
  })

  it('returns "posted" even with only review_posted event and queued status', () => {
    expect(
      deriveFunnelStage(makeRow({ status: 'queued', events: [makeEvent('review_posted')] })),
    ).toBe('posted')
  })
})

// ─── firstEventAt ─────────────────────────────────────────────────────────────

describe('firstEventAt', () => {
  it('returns null when events array is empty', () => {
    expect(firstEventAt([], 'email_opened')).toBeNull()
  })

  it('returns null when event type does not match', () => {
    expect(firstEventAt([makeEvent('sent')], 'email_opened')).toBeNull()
  })

  it('returns occurred_at of the matching event', () => {
    expect(firstEventAt([makeEvent('email_opened', '2026-05-17T12:00:00Z')], 'email_opened')).toBe(
      '2026-05-17T12:00:00Z',
    )
  })

  it('returns the earliest occurred_at when multiple events of same type exist', () => {
    const events = [
      makeEvent('email_opened', '2026-05-17T14:00:00Z'),
      makeEvent('email_opened', '2026-05-17T10:00:00Z'),
    ]
    expect(firstEventAt(events, 'email_opened')).toBe('2026-05-17T10:00:00Z')
  })
})

// ─── aggregateFunnel ──────────────────────────────────────────────────────────

describe('aggregateFunnel', () => {
  it('returns all zeros for an empty row set', () => {
    expect(aggregateFunnel([])).toEqual({
      total: 0,
      sent: 0,
      opened: 0,
      clicked: 0,
      copied: 0,
      posted: 0,
    })
  })

  it('counts only sent rows (excludes queued and failed from sent count)', () => {
    const rows = [
      makeRow({ status: 'sent', events: [] }),
      makeRow({ status: 'queued', events: [] }),
      makeRow({ status: 'failed', events: [] }),
    ]
    const result = aggregateFunnel(rows)
    expect(result.total).toBe(3)
    expect(result.sent).toBe(1)
    expect(result.opened).toBe(0)
  })

  it('counts opened as a subset of sent', () => {
    const rows = [
      makeRow({ status: 'sent', events: [makeEvent('email_opened')] }),
      makeRow({ status: 'sent', events: [] }),
    ]
    const result = aggregateFunnel(rows)
    expect(result.sent).toBe(2)
    expect(result.opened).toBe(1)
  })

  it('accumulates counts correctly across a mixed set', () => {
    const rows = [
      makeRow({
        status: 'sent',
        events: [
          makeEvent('email_opened'),
          makeEvent('link_clicked'),
          makeEvent('review_copied'),
          makeEvent('review_posted'),
        ],
      }),
      makeRow({ status: 'sent', events: [makeEvent('email_opened')] }),
      makeRow({ status: 'queued', events: [] }),
    ]
    const result = aggregateFunnel(rows)
    expect(result.total).toBe(3)
    expect(result.sent).toBe(2)
    expect(result.opened).toBe(2)
    expect(result.clicked).toBe(1)
    expect(result.copied).toBe(1)
    expect(result.posted).toBe(1)
  })
})
