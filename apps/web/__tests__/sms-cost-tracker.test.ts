import { describe, it, expect, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// SMS cost tracker logic (S408 branch — not yet merged).
// Pure counter logic extracted and tested here in isolation.
// ---------------------------------------------------------------------------

// Twilio pricing constants (as of 2025)
const COST_PER_SEGMENT_USD = 0.0079
const ALERT_THRESHOLD_USD = 40

type MonthKey = string // "YYYY-MM"

type UsageStore = {
  month: MonthKey
  segments: number
  totalCostUsd: number
}

/** Format a Date as "YYYY-MM" for use as a month key (UTC). */
function getMonthKey(date: Date): MonthKey {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

/** In-memory store — in production this would be backed by Redis or Supabase. */
class CostTracker {
  private store: Map<MonthKey, UsageStore> = new Map()

  trackSMSUsage(segments: number, date: Date = new Date()): UsageStore {
    const key = getMonthKey(date)
    const existing = this.store.get(key) ?? { month: key, segments: 0, totalCostUsd: 0 }

    const updated: UsageStore = {
      month: key,
      segments: existing.segments + segments,
      totalCostUsd: existing.totalCostUsd + segments * COST_PER_SEGMENT_USD,
    }

    this.store.set(key, updated)
    return updated
  }

  getCurrentMonthUsage(date: Date = new Date()): UsageStore {
    const key = getMonthKey(date)
    return this.store.get(key) ?? { month: key, segments: 0, totalCostUsd: 0 }
  }

  checkCostAlert(date: Date = new Date()): boolean {
    const usage = this.getCurrentMonthUsage(date)
    return usage.totalCostUsd >= ALERT_THRESHOLD_USD
  }

  reset() {
    this.store.clear()
  }
}

// ---------------------------------------------------------------------------

describe('CostTracker.trackSMSUsage', () => {
  let tracker: CostTracker

  beforeEach(() => {
    tracker = new CostTracker()
  })

  it('starts with zero usage for a new month', () => {
    const usage = tracker.getCurrentMonthUsage(new Date('2026-04-01'))
    expect(usage.segments).toBe(0)
    expect(usage.totalCostUsd).toBe(0)
  })

  it('increments segment count on each call', () => {
    const date = new Date('2026-04-01')
    tracker.trackSMSUsage(1, date)
    tracker.trackSMSUsage(1, date)
    const usage = tracker.getCurrentMonthUsage(date)
    expect(usage.segments).toBe(2)
  })

  it('accumulates cost correctly for multiple segments in one call', () => {
    const date = new Date('2026-04-01')
    tracker.trackSMSUsage(5, date)
    const usage = tracker.getCurrentMonthUsage(date)
    expect(usage.totalCostUsd).toBeCloseTo(5 * COST_PER_SEGMENT_USD)
  })

  it('returns updated store with running totals', () => {
    const date = new Date('2026-04-01')
    tracker.trackSMSUsage(3, date)
    const result = tracker.trackSMSUsage(2, date)
    expect(result.segments).toBe(5)
    expect(result.totalCostUsd).toBeCloseTo(5 * COST_PER_SEGMENT_USD)
  })

  it('creates a new counter on month rollover', () => {
    const april = new Date('2026-04-15')
    const may = new Date('2026-05-01')

    tracker.trackSMSUsage(100, april)
    tracker.trackSMSUsage(1, may)

    const aprilUsage = tracker.getCurrentMonthUsage(april)
    const mayUsage = tracker.getCurrentMonthUsage(may)

    expect(aprilUsage.segments).toBe(100)
    expect(mayUsage.segments).toBe(1)
  })

  it('does not bleed usage across months', () => {
    const march = new Date('2026-03-31')
    const april = new Date('2026-04-01')

    tracker.trackSMSUsage(50, march)
    const aprilUsage = tracker.getCurrentMonthUsage(april)

    expect(aprilUsage.segments).toBe(0)
    expect(aprilUsage.totalCostUsd).toBe(0)
  })
})

describe('CostTracker.checkCostAlert', () => {
  let tracker: CostTracker

  beforeEach(() => {
    tracker = new CostTracker()
  })

  it('returns false when no usage has been recorded', () => {
    expect(tracker.checkCostAlert(new Date('2026-04-01'))).toBe(false)
  })

  it('returns false when cost is below the $40 threshold', () => {
    const date = new Date('2026-04-01')
    // 1000 segments ≈ $7.90 — well below $40
    tracker.trackSMSUsage(1000, date)
    expect(tracker.checkCostAlert(date)).toBe(false)
  })

  it('returns true when cost reaches exactly $40', () => {
    const date = new Date('2026-04-01')
    const segmentsNeeded = Math.ceil(ALERT_THRESHOLD_USD / COST_PER_SEGMENT_USD)
    tracker.trackSMSUsage(segmentsNeeded, date)
    expect(tracker.checkCostAlert(date)).toBe(true)
  })

  it('returns true when cost exceeds $40', () => {
    const date = new Date('2026-04-01')
    // 10,000 segments ≈ $79 — over $40
    tracker.trackSMSUsage(10_000, date)
    expect(tracker.checkCostAlert(date)).toBe(true)
  })

  it('alert does not fire in a new month after threshold was hit last month', () => {
    const march = new Date('2026-03-15')
    const april = new Date('2026-04-01')

    tracker.trackSMSUsage(10_000, march)
    expect(tracker.checkCostAlert(march)).toBe(true)
    expect(tracker.checkCostAlert(april)).toBe(false)
  })
})

describe('CostTracker.getCurrentMonthUsage', () => {
  let tracker: CostTracker

  beforeEach(() => {
    tracker = new CostTracker()
  })

  it('returns the correct month key', () => {
    const date = new Date('2026-04-15')
    const usage = tracker.getCurrentMonthUsage(date)
    expect(usage.month).toBe('2026-04')
  })

  it('includes segments and cost in the returned data', () => {
    const date = new Date('2026-04-15')
    tracker.trackSMSUsage(10, date)
    const usage = tracker.getCurrentMonthUsage(date)
    expect(usage.segments).toBe(10)
    expect(usage.totalCostUsd).toBeGreaterThan(0)
  })
})
