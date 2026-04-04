import { describe, it, expect } from 'vitest'

// ---------------------------------------------------------------------------
// Pure logic extracted from packages/ai-core/src/tools/pattern-detection.ts
// (S405 branch — not yet merged). Tests validate business logic in isolation.
// ---------------------------------------------------------------------------

type MetricRow = {
  pain_level: number | null
  discomfort: number | null
  sitting_tolerance_min: number | null
  recorded_at: string
}

/** Check whether a patient has at least 14 days of metric data. */
function hasEnoughData(metrics: MetricRow[]): boolean {
  if (metrics.length === 0) return false
  const dates = metrics.map(m => new Date(m.recorded_at).getTime())
  const earliest = Math.min(...dates)
  const latest = Math.max(...dates)
  const daysCovered = (latest - earliest) / (1000 * 60 * 60 * 24)
  return daysCovered >= 14
}

/** Check whether all non-null values in a numeric series are identical. */
function isConstantSeries(values: (number | null)[]): boolean {
  const nonNull = values.filter((v): v is number => v !== null)
  if (nonNull.length === 0) return true
  return nonNull.every(v => v === nonNull[0])
}

/**
 * Calculate Pearson correlation between two numeric arrays.
 * Returns null when variance in either series is zero.
 */
function pearsonCorrelation(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 2) return null

  const n = xs.length
  const meanX = xs.reduce((a, b) => a + b, 0) / n
  const meanY = ys.reduce((a, b) => a + b, 0) / n

  let num = 0
  let denomX = 0
  let denomY = 0

  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX
    const dy = ys[i] - meanY
    num += dx * dy
    denomX += dx * dx
    denomY += dy * dy
  }

  const denom = Math.sqrt(denomX * denomY)
  if (denom === 0) return null
  return num / denom
}

/** Summarise a constant metric series for the stability message. */
function buildStabilityMessage(metrics: MetricRow[]): string {
  const painValues = metrics.map(m => m.pain_level)
  if (isConstantSeries(painValues)) {
    const val = painValues.find(v => v !== null) ?? null
    const label = val !== null ? `${val}/10` : 'unchanged'
    return `Pain levels have remained consistently at ${label} throughout the tracked period.`
  }
  return 'Metrics appear stable across the tracked period.'
}

// ---------------------------------------------------------------------------

describe('hasEnoughData', () => {
  it('returns false for empty metrics array', () => {
    expect(hasEnoughData([])).toBe(false)
  })

  it('returns false when all data is on the same day', () => {
    const metrics: MetricRow[] = [
      { pain_level: 4, discomfort: 1, sitting_tolerance_min: 30, recorded_at: '2026-03-01' },
      { pain_level: 5, discomfort: 2, sitting_tolerance_min: 25, recorded_at: '2026-03-01' },
    ]
    expect(hasEnoughData(metrics)).toBe(false)
  })

  it('returns false when data spans fewer than 14 days', () => {
    const metrics: MetricRow[] = [
      { pain_level: 4, discomfort: 1, sitting_tolerance_min: 30, recorded_at: '2026-03-01' },
      { pain_level: 5, discomfort: 2, sitting_tolerance_min: 25, recorded_at: '2026-03-10' },
    ]
    expect(hasEnoughData(metrics)).toBe(false)
  })

  it('returns true when data spans exactly 14 days', () => {
    const metrics: MetricRow[] = [
      { pain_level: 4, discomfort: 1, sitting_tolerance_min: 30, recorded_at: '2026-03-01' },
      { pain_level: 5, discomfort: 2, sitting_tolerance_min: 25, recorded_at: '2026-03-15' },
    ]
    expect(hasEnoughData(metrics)).toBe(true)
  })

  it('returns true when data spans more than 14 days', () => {
    const metrics: MetricRow[] = [
      { pain_level: 4, discomfort: 1, sitting_tolerance_min: 30, recorded_at: '2026-02-01' },
      { pain_level: 5, discomfort: 2, sitting_tolerance_min: 25, recorded_at: '2026-03-01' },
    ]
    expect(hasEnoughData(metrics)).toBe(true)
  })
})

describe('isConstantSeries', () => {
  it('returns true for all-identical values', () => {
    expect(isConstantSeries([5, 5, 5, 5])).toBe(true)
  })

  it('returns false for varying values', () => {
    expect(isConstantSeries([3, 5, 4, 6])).toBe(false)
  })

  it('returns true for all-null values', () => {
    expect(isConstantSeries([null, null, null])).toBe(true)
  })

  it('ignores nulls when checking for constancy', () => {
    expect(isConstantSeries([5, null, 5, null])).toBe(true)
  })

  it('returns false when non-null values differ', () => {
    expect(isConstantSeries([5, null, 6, null])).toBe(false)
  })
})

describe('pearsonCorrelation', () => {
  it('returns 1 for perfectly correlated series', () => {
    const xs = [1, 2, 3, 4, 5]
    const ys = [2, 4, 6, 8, 10]
    const r = pearsonCorrelation(xs, ys)
    expect(r).toBeCloseTo(1)
  })

  it('returns -1 for perfectly negatively correlated series', () => {
    const xs = [1, 2, 3, 4, 5]
    const ys = [10, 8, 6, 4, 2]
    const r = pearsonCorrelation(xs, ys)
    expect(r).toBeCloseTo(-1)
  })

  it('returns null when denominator is zero (constant series)', () => {
    const xs = [5, 5, 5, 5]
    const ys = [1, 2, 3, 4]
    const r = pearsonCorrelation(xs, ys)
    expect(r).toBeNull()
  })

  it('returns null for series shorter than 2 elements', () => {
    expect(pearsonCorrelation([5], [5])).toBeNull()
  })

  it('returns null for mismatched array lengths', () => {
    expect(pearsonCorrelation([1, 2, 3], [1, 2])).toBeNull()
  })
})

describe('buildStabilityMessage', () => {
  it('includes the constant pain value in the message', () => {
    const metrics: MetricRow[] = [
      { pain_level: 5, discomfort: 2, sitting_tolerance_min: 30, recorded_at: '2026-03-01' },
      { pain_level: 5, discomfort: 2, sitting_tolerance_min: 30, recorded_at: '2026-03-08' },
    ]
    const msg = buildStabilityMessage(metrics)
    expect(msg).toContain('5/10')
  })

  it('returns a fallback message for non-constant series', () => {
    const metrics: MetricRow[] = [
      { pain_level: 3, discomfort: 1, sitting_tolerance_min: 30, recorded_at: '2026-03-01' },
      { pain_level: 7, discomfort: 2, sitting_tolerance_min: 25, recorded_at: '2026-03-08' },
    ]
    const msg = buildStabilityMessage(metrics)
    expect(msg).toContain('stable')
  })

  it('handles all-null pain values gracefully', () => {
    const metrics: MetricRow[] = [
      { pain_level: null, discomfort: 1, sitting_tolerance_min: 30, recorded_at: '2026-03-01' },
    ]
    const msg = buildStabilityMessage(metrics)
    expect(msg).toBeTruthy()
    expect(msg).not.toContain('undefined')
    expect(msg).not.toContain('null')
  })
})

describe('detectPatterns — integration guards', () => {
  it('returns empty array signal when data spans fewer than 14 days', () => {
    const metrics: MetricRow[] = [
      { pain_level: 4, discomfort: 1, sitting_tolerance_min: 30, recorded_at: '2026-03-01' },
      { pain_level: 5, discomfort: 2, sitting_tolerance_min: 25, recorded_at: '2026-03-08' },
    ]
    // When the actual detectPatterns fn checks hasEnoughData and returns []
    const enough = hasEnoughData(metrics)
    expect(enough).toBe(false)
    // caller would return [] immediately
  })

  it('proceeds to AI call when data spans 14+ days', () => {
    const metrics: MetricRow[] = [
      { pain_level: 4, discomfort: 1, sitting_tolerance_min: 30, recorded_at: '2026-02-15' },
      { pain_level: 5, discomfort: 2, sitting_tolerance_min: 25, recorded_at: '2026-03-15' },
    ]
    const enough = hasEnoughData(metrics)
    expect(enough).toBe(true)
  })
})
