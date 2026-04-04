import { tool } from 'ai'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@physio-os/shared'
import { avg, round1, countExerciseDays, type QueriedMetric } from './utils'

type Trend = 'improving' | 'stable' | 'worsening'

/**
 * Compare this week's average vs last week's average for pain and discomfort.
 * Pain and discomfort are "bad" metrics — lower is better.
 * Returns null when there is insufficient data for a comparison.
 */
function calcTrend(
  thisWeek: QueriedMetric[],
  lastWeek: QueriedMetric[]
): { trend: Trend; metric: string; thisAvg: number; lastAvg: number } | null {
  const thisPain = thisWeek.map((r) => r.pain_level).filter((v): v is number => v != null)
  const lastPain = lastWeek.map((r) => r.pain_level).filter((v): v is number => v != null)
  const thisDiscomfort = thisWeek
    .map((r) => r.discomfort)
    .filter((v): v is number => v != null)
  const lastDiscomfort = lastWeek
    .map((r) => r.discomfort)
    .filter((v): v is number => v != null)

  // Prefer discomfort trend; fall back to pain
  for (const [metric, thisVals, lastVals] of [
    ['discomfort', thisDiscomfort, lastDiscomfort],
    ['pain', thisPain, lastPain],
  ] as const) {
    const thisAvg = avg(thisVals)
    const lastAvg = avg(lastVals)
    if (thisAvg == null || lastAvg == null) continue

    const delta = thisAvg - lastAvg
    let trend: Trend
    if (delta < -0.5) trend = 'improving'
    else if (delta > 0.5) trend = 'worsening'
    else trend = 'stable'

    return { trend, metric, thisAvg, lastAvg }
  }

  return null
}

export function createGetHistoryTool(patientId: string, supabase: SupabaseClient<Database>) {
  return tool({
    description:
      'Retrieve the patient recovery history and computed trend summary for the last N days. ' +
      'Use this to give the patient context about their recent progress before advising them.',
    inputSchema: z.object({
      days: z
        .number()
        .min(1)
        .max(30)
        .default(7)
        .describe('Number of days of history to retrieve (1–30, default 7)'),
    }),
    execute: async ({ days }) => {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

      const { data, error } = await supabase
        .from('metrics')
        .select(
          'pain_level, discomfort, sitting_tolerance_min, exercises_done, exercise_count, recorded_at'
        )
        .eq('patient_id', patientId)
        .gte('recorded_at', since)
        .order('recorded_at', { ascending: false })

      if (error) {
        console.error('[get_history] Supabase error', error)
        return 'Unable to retrieve history right now. Please try again.'
      }

      const rows = (data ?? []) as QueriedMetric[]

      if (rows.length === 0) {
        return "No metrics recorded yet. Let's start tracking today!"
      }

      // --- averages and ranges ---
      const painVals = rows.map((r) => r.pain_level).filter((v): v is number => v != null)
      const discVals = rows.map((r) => r.discomfort).filter((v): v is number => v != null)
      const sitVals = rows
        .map((r) => r.sitting_tolerance_min)
        .filter((v): v is number => v != null)

      const avgPain = avg(painVals)
      const avgDisc = avg(discVals)
      const avgSit = avg(sitVals)

      const minPain = painVals.length ? Math.min(...painVals) : null
      const maxPain = painVals.length ? Math.max(...painVals) : null
      const minDisc = discVals.length ? Math.min(...discVals) : null
      const maxDisc = discVals.length ? Math.max(...discVals) : null

      const exerciseDays = countExerciseDays(rows)

      // --- trend (only when we have more than 2 days of data overall) ---
      let trendLine = ''
      if (rows.length > 2) {
        const weekMs = 7 * 24 * 60 * 60 * 1000
        const now = Date.now()
        const thisWeekRows = rows.filter(
          (r) => new Date(r.recorded_at).getTime() >= now - weekMs
        )
        const lastWeekRows = rows.filter((r) => {
          const t = new Date(r.recorded_at).getTime()
          return t >= now - 2 * weekMs && t < now - weekMs
        })

        const trendResult = calcTrend(thisWeekRows, lastWeekRows)
        if (trendResult) {
          const { trend, metric, thisAvg, lastAvg } = trendResult
          trendLine = `\n- Trend: ${metric} ${trend} (was ${round1(lastAvg)} last week, now ${round1(thisAvg)})`
        }
      }

      // --- build output ---
      const lines: string[] = [`Last ${days} day${days === 1 ? '' : 's'}:`]

      if (avgPain != null) {
        lines.push(
          `- Avg pain: ${round1(avgPain)}${minPain != null && maxPain != null ? ` (range: ${minPain}–${maxPain})` : ''}`
        )
      }

      if (avgDisc != null) {
        lines.push(
          `- Avg discomfort: ${round1(avgDisc)}${minDisc != null && maxDisc != null ? ` (range: ${minDisc}–${maxDisc})` : ''}`
        )
      }

      if (avgSit != null) {
        lines.push(`- Avg sitting tolerance: ${Math.round(avgSit)} min`)
      }

      lines.push(`- Exercises completed: ${exerciseDays}/${days} days`)

      if (trendLine) lines.push(trendLine.trimStart())

      return lines.join('\n')
    },
  })
}
