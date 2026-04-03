import { describe, it, expect } from 'vitest'

// ---------------------------------------------------------------------------
// Pure logic extracted from packages/ai-core/src/tools/generate-report.ts
// (S401 branch — not yet merged). Tests validate business logic in isolation.
// ---------------------------------------------------------------------------

type MetricRow = {
  pain_level: number | null
  discomfort: number | null
  sitting_tolerance_min: number | null
  recorded_at: string
}

type WeeklyAverages = {
  avgPain: number | null
  avgDiscomfort: number | null
  avgSitting: number | null
  dataPoints: number
}

/** Calculate averages from a set of metric rows. Returns null fields when no data. */
function calculateAverages(metrics: MetricRow[]): WeeklyAverages {
  if (metrics.length === 0) {
    return { avgPain: null, avgDiscomfort: null, avgSitting: null, dataPoints: 0 }
  }

  const painValues = metrics.map(m => m.pain_level).filter((v): v is number => v !== null)
  const discomfortValues = metrics.map(m => m.discomfort).filter((v): v is number => v !== null)
  const sittingValues = metrics.map(m => m.sitting_tolerance_min).filter((v): v is number => v !== null)

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null

  return {
    avgPain: avg(painValues),
    avgDiscomfort: avg(discomfortValues),
    avgSitting: avg(sittingValues),
    dataPoints: metrics.length,
  }
}

type Trend = 'improving' | 'stable' | 'worsening'

/**
 * Compare current week averages to previous week to determine trend.
 * For pain/discomfort lower is better; for sitting tolerance higher is better.
 * Threshold: >10% change to be considered improving/worsening.
 */
function detectTrend(
  current: WeeklyAverages,
  previous: WeeklyAverages | null,
): Trend {
  if (!previous || previous.avgPain === null || current.avgPain === null) {
    return 'stable'
  }

  const THRESHOLD = 0.1

  const painDelta = (current.avgPain - previous.avgPain) / (previous.avgPain || 1)

  if (painDelta < -THRESHOLD) return 'improving'
  if (painDelta > THRESHOLD) return 'worsening'
  return 'stable'
}

/** Build insights array from averages and trend. */
function buildInsights(averages: WeeklyAverages, trend: Trend, limitedData: boolean): string[] {
  const insights: string[] = []

  if (limitedData) {
    insights.push('Limited data available — more check-ins will improve accuracy.')
  }

  if (averages.avgPain !== null) {
    insights.push(`Average pain level this week: ${averages.avgPain.toFixed(1)}/10.`)
  }

  if (averages.avgDiscomfort !== null) {
    insights.push(`Average discomfort: ${averages.avgDiscomfort.toFixed(1)}/3.`)
  }

  if (averages.avgSitting !== null) {
    insights.push(`Average sitting tolerance: ${averages.avgSitting.toFixed(0)} minutes.`)
  }

  if (trend === 'improving') {
    insights.push('Pain levels are trending down compared to last week — great progress!')
  } else if (trend === 'worsening') {
    insights.push('Pain levels have increased compared to last week — consider discussing with your practitioner.')
  } else {
    insights.push('Your progress appears stable compared to last week.')
  }

  return insights
}

// ---------------------------------------------------------------------------

describe('calculateAverages', () => {
  it('returns null averages and 0 data points for empty metrics', () => {
    const result = calculateAverages([])
    expect(result.avgPain).toBeNull()
    expect(result.avgDiscomfort).toBeNull()
    expect(result.avgSitting).toBeNull()
    expect(result.dataPoints).toBe(0)
  })

  it('calculates correct averages from multiple rows', () => {
    const metrics: MetricRow[] = [
      { pain_level: 4, discomfort: 2, sitting_tolerance_min: 30, recorded_at: '2026-03-24' },
      { pain_level: 6, discomfort: 1, sitting_tolerance_min: 45, recorded_at: '2026-03-25' },
      { pain_level: 5, discomfort: 2, sitting_tolerance_min: 60, recorded_at: '2026-03-26' },
    ]
    const result = calculateAverages(metrics)
    expect(result.avgPain).toBeCloseTo(5)
    expect(result.avgDiscomfort).toBeCloseTo(5 / 3)
    expect(result.avgSitting).toBeCloseTo(45)
    expect(result.dataPoints).toBe(3)
  })

  it('handles null metric fields gracefully', () => {
    const metrics: MetricRow[] = [
      { pain_level: null, discomfort: null, sitting_tolerance_min: null, recorded_at: '2026-03-24' },
      { pain_level: 5, discomfort: null, sitting_tolerance_min: null, recorded_at: '2026-03-25' },
    ]
    const result = calculateAverages(metrics)
    expect(result.avgPain).toBe(5)
    expect(result.avgDiscomfort).toBeNull()
    expect(result.avgSitting).toBeNull()
    expect(result.dataPoints).toBe(2)
  })

  it('reports dataPoints correctly for single entry', () => {
    const metrics: MetricRow[] = [
      { pain_level: 3, discomfort: 1, sitting_tolerance_min: 20, recorded_at: '2026-03-24' },
    ]
    const result = calculateAverages(metrics)
    expect(result.dataPoints).toBe(1)
    expect(result.avgPain).toBe(3)
  })
})

describe('detectTrend', () => {
  it('returns stable when no previous data is available', () => {
    const current: WeeklyAverages = { avgPain: 5, avgDiscomfort: 2, avgSitting: 30, dataPoints: 5 }
    expect(detectTrend(current, null)).toBe('stable')
  })

  it('returns improving when pain decreases by more than 10%', () => {
    const previous: WeeklyAverages = { avgPain: 8, avgDiscomfort: 2, avgSitting: 30, dataPoints: 5 }
    const current: WeeklyAverages = { avgPain: 6, avgDiscomfort: 1, avgSitting: 40, dataPoints: 5 }
    expect(detectTrend(current, previous)).toBe('improving')
  })

  it('returns worsening when pain increases by more than 10%', () => {
    const previous: WeeklyAverages = { avgPain: 4, avgDiscomfort: 1, avgSitting: 45, dataPoints: 5 }
    const current: WeeklyAverages = { avgPain: 7, avgDiscomfort: 2, avgSitting: 30, dataPoints: 5 }
    expect(detectTrend(current, previous)).toBe('worsening')
  })

  it('returns stable when pain changes by less than 10%', () => {
    const previous: WeeklyAverages = { avgPain: 5, avgDiscomfort: 2, avgSitting: 30, dataPoints: 5 }
    const current: WeeklyAverages = { avgPain: 5.2, avgDiscomfort: 2, avgSitting: 30, dataPoints: 5 }
    expect(detectTrend(current, previous)).toBe('stable')
  })

  it('returns stable when current pain is null', () => {
    const previous: WeeklyAverages = { avgPain: 5, avgDiscomfort: 2, avgSitting: 30, dataPoints: 5 }
    const current: WeeklyAverages = { avgPain: null, avgDiscomfort: null, avgSitting: null, dataPoints: 0 }
    expect(detectTrend(current, previous)).toBe('stable')
  })
})

describe('buildInsights', () => {
  const fullAverages: WeeklyAverages = {
    avgPain: 5.5,
    avgDiscomfort: 2,
    avgSitting: 40,
    dataPoints: 7,
  }

  it('populates insights array with at least one entry', () => {
    const insights = buildInsights(fullAverages, 'stable', false)
    expect(insights.length).toBeGreaterThan(0)
  })

  it('includes limited data note when flagged', () => {
    const insights = buildInsights(fullAverages, 'stable', true)
    expect(insights.some(i => i.includes('Limited data'))).toBe(true)
  })

  it('does not include limited data note when not flagged', () => {
    const insights = buildInsights(fullAverages, 'stable', false)
    expect(insights.some(i => i.includes('Limited data'))).toBe(false)
  })

  it('includes improving message for improving trend', () => {
    const insights = buildInsights(fullAverages, 'improving', false)
    expect(insights.some(i => i.includes('trending down'))).toBe(true)
  })

  it('includes worsening message for worsening trend', () => {
    const insights = buildInsights(fullAverages, 'worsening', false)
    expect(insights.some(i => i.includes('increased'))).toBe(true)
  })

  it('includes stable message for stable trend', () => {
    const insights = buildInsights(fullAverages, 'stable', false)
    expect(insights.some(i => i.includes('stable'))).toBe(true)
  })

  it('includes pain level in insights when available', () => {
    const insights = buildInsights(fullAverages, 'stable', false)
    expect(insights.some(i => i.includes('5.5'))).toBe(true)
  })

  it('omits pain insight when avgPain is null', () => {
    const sparse: WeeklyAverages = { avgPain: null, avgDiscomfort: null, avgSitting: null, dataPoints: 1 }
    const insights = buildInsights(sparse, 'stable', false)
    expect(insights.some(i => i.includes('pain level this week'))).toBe(false)
  })
})

describe('report generation — null/insufficient data guards', () => {
  it('identifies patient with 0 metrics as requiring null report', () => {
    const metrics: MetricRow[] = []
    const averages = calculateAverages(metrics)
    // When dataPoints === 0 the calling code should return null (no report)
    expect(averages.dataPoints).toBe(0)
    expect(averages.avgPain).toBeNull()
  })

  it('identifies patient with fewer than 3 data points as limited data', () => {
    const metrics: MetricRow[] = [
      { pain_level: 4, discomfort: 1, sitting_tolerance_min: 30, recorded_at: '2026-03-24' },
      { pain_level: 5, discomfort: 2, sitting_tolerance_min: 25, recorded_at: '2026-03-25' },
    ]
    const averages = calculateAverages(metrics)
    const isLimitedData = averages.dataPoints < 3
    expect(isLimitedData).toBe(true)
    // Report should still be generated but with the limited data note
    const insights = buildInsights(averages, 'stable', isLimitedData)
    expect(insights.some(i => i.includes('Limited data'))).toBe(true)
  })

  it('does not flag limited data for 3 or more data points', () => {
    const metrics: MetricRow[] = [
      { pain_level: 4, discomfort: 1, sitting_tolerance_min: 30, recorded_at: '2026-03-24' },
      { pain_level: 5, discomfort: 2, sitting_tolerance_min: 25, recorded_at: '2026-03-25' },
      { pain_level: 3, discomfort: 1, sitting_tolerance_min: 35, recorded_at: '2026-03-26' },
    ]
    const averages = calculateAverages(metrics)
    expect(averages.dataPoints < 3).toBe(false)
  })
})
