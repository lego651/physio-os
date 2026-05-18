// apps/web/app/(clinic)/dashboard/review-funnel/funnel-logic.ts
// Pure, framework-free logic for the funnel observability page.
// No React imports — safe to import from vitest without DOM setup.

export interface FunnelEvent {
  event_type: string
  occurred_at: string
  metadata: unknown
}

export interface ReviewRow {
  id: string
  status: string
  events: FunnelEvent[]
}

export type FunnelStage = 'queued' | 'sent' | 'opened' | 'clicked' | 'copied' | 'posted' | 'failed'

/**
 * Returns the highest funnel stage reached for a review request row.
 * Priority (highest wins): posted > copied > clicked > opened > sent > failed > queued
 */
export function deriveFunnelStage(row: ReviewRow): FunnelStage {
  const types = new Set(row.events.map((e) => e.event_type))
  if (types.has('review_posted')) return 'posted'
  if (types.has('review_copied')) return 'copied'
  if (types.has('link_clicked')) return 'clicked'
  if (types.has('email_opened')) return 'opened'
  if (types.has('sent') || row.status === 'sent') return 'sent'
  if (types.has('failed') || row.status === 'failed') return 'failed'
  return 'queued'
}

/**
 * Returns the ISO timestamp of the first occurrence of a given event type, or null.
 */
export function firstEventAt(events: FunnelEvent[], eventType: string): string | null {
  const matching = events
    .filter((e) => e.event_type === eventType)
    .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))
  return matching[0]?.occurred_at ?? null
}

/**
 * Aggregates funnel conversion counts across all review request rows.
 * Each stage count = number of rows that reached at least that stage.
 * "sent" excludes failed and queued rows.
 */
export function aggregateFunnel(rows: ReviewRow[]): {
  total: number
  sent: number
  opened: number
  clicked: number
  copied: number
  posted: number
} {
  const stageRank: Record<FunnelStage, number> = {
    queued: 0,
    failed: 0, // failed = dispatch failed; not counted as "sent"
    sent: 1,
    opened: 2,
    clicked: 3,
    copied: 4,
    posted: 5,
  }

  let sent = 0,
    opened = 0,
    clicked = 0,
    copied = 0,
    posted = 0

  for (const row of rows) {
    const rank = stageRank[deriveFunnelStage(row)]
    if (rank >= 1) sent++
    if (rank >= 2) opened++
    if (rank >= 3) clicked++
    if (rank >= 4) copied++
    if (rank >= 5) posted++
  }

  return { total: rows.length, sent, opened, clicked, copied, posted }
}
