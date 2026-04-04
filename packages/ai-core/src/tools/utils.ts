import type { Database } from '@physio-os/shared'

type MetricRow = Database['public']['Tables']['metrics']['Row']

/** Subset of MetricRow matching the columns commonly queried by tools. */
export type QueriedMetric = Pick<
  MetricRow,
  'pain_level' | 'discomfort' | 'sitting_tolerance_min' | 'exercises_done' | 'exercise_count' | 'recorded_at'
>

/** Average of a numeric array; returns null if empty. */
export function avg(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

/** Round to one decimal place. */
export function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/** Count the number of metric rows where exercises were completed. */
export function countExerciseDays(rows: QueriedMetric[]): number {
  return rows.filter(
    (r) => (r.exercise_count ?? 0) > 0 || (r.exercises_done?.length ?? 0) > 0,
  ).length
}
