import { generateText, Output } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@physio-os/shared'
import { avg, round1, type QueriedMetric } from './utils'

const MIN_DAYS_FOR_PATTERNS = 14
const DEFAULT_MODEL = 'claude-sonnet-4.6'

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Extract the YYYY-MM-DD date string from an ISO timestamp. */
function toDateKey(isoString: string): string {
  return isoString.slice(0, 10)
}

/** Returns true if the day's metrics indicate exercises were completed. */
function exercisesDone(row: QueriedMetric): boolean {
  return (row.exercise_count ?? 0) > 0 || (row.exercises_done?.length ?? 0) > 0
}

/** Derive ISO weekday number (1 = Monday … 7 = Sunday) from a YYYY-MM-DD string. */
function isoWeekday(dateKey: string): number {
  const d = new Date(`${dateKey}T00:00:00Z`)
  const day = d.getUTCDay() // 0 = Sunday
  return day === 0 ? 7 : day
}

// ---------------------------------------------------------------------------
// DailyRecord — one entry per calendar day
// ---------------------------------------------------------------------------

interface DailyRecord {
  date: string
  discomfort: number | null
  pain: number | null
  sittingTolerance: number | null
  exercisesDone: boolean
  isWeekend: boolean
}

/**
 * Collapse multiple metric rows that share the same calendar date into one
 * DailyRecord using averages for numeric fields.  exercise presence is OR'd
 * across all rows for the day.
 */
function buildDailyRecords(metrics: QueriedMetric[]): DailyRecord[] {
  // Group rows by date
  const byDate = new Map<string, QueriedMetric[]>()
  for (const row of metrics) {
    const key = toDateKey(row.recorded_at)
    const existing = byDate.get(key)
    if (existing) {
      existing.push(row)
    } else {
      byDate.set(key, [row])
    }
  }

  // Sort dates ascending
  const sortedDates = Array.from(byDate.keys()).sort()

  return sortedDates.map((date) => {
    const rows = byDate.get(date)!
    const discVals = rows.map((r) => r.discomfort).filter((v): v is number => v != null)
    const painVals = rows.map((r) => r.pain_level).filter((v): v is number => v != null)
    const sitVals = rows.map((r) => r.sitting_tolerance_min).filter((v): v is number => v != null)
    const didExercise = rows.some(exercisesDone)
    const weekday = isoWeekday(date)

    return {
      date,
      discomfort: avg(discVals),
      pain: avg(painVals),
      sittingTolerance: avg(sitVals),
      exercisesDone: didExercise,
      isWeekend: weekday >= 6,
    }
  })
}

// ---------------------------------------------------------------------------
// Correlation helpers
// ---------------------------------------------------------------------------

interface CorrelationResult {
  afterExercise: number | null
  afterNoExercise: number | null
  sampleSize: number
}

/**
 * For each consecutive day pair (day N, day N+1), compare discomfort on
 * day N+1 based on whether exercises were done on day N.
 *
 * Returns the average next-day discomfort after exercise days vs no-exercise
 * days, plus total paired samples counted.  Returns null averages when a
 * partition is empty.
 */
function exerciseNextDayCorrelation(days: DailyRecord[]): CorrelationResult {
  const afterExerciseVals: number[] = []
  const afterNoExerciseVals: number[] = []

  for (let i = 0; i < days.length - 1; i++) {
    const today = days[i]
    const tomorrow = days[i + 1]
    if (tomorrow.discomfort == null) continue

    if (today.exercisesDone) {
      afterExerciseVals.push(tomorrow.discomfort)
    } else {
      afterNoExerciseVals.push(tomorrow.discomfort)
    }
  }

  return {
    afterExercise: avg(afterExerciseVals),
    afterNoExercise: avg(afterNoExerciseVals),
    sampleSize: afterExerciseVals.length + afterNoExerciseVals.length,
  }
}

type Trend = 'improving' | 'stable' | 'declining'

/**
 * Compute a simple trend by comparing the first-half vs second-half mean of a
 * series.  "improving" means values are going down (e.g. pain), "declining"
 * means going up.
 */
function computeHalfTrend(values: (number | null)[]): Trend {
  const nums = values.filter((v): v is number => v != null)
  if (nums.length < 4) return 'stable'

  const mid = Math.floor(nums.length / 2)
  const firstHalf = avg(nums.slice(0, mid))!
  const secondHalf = avg(nums.slice(mid))!
  const delta = secondHalf - firstHalf

  if (delta < -0.5) return 'improving'
  if (delta > 0.5) return 'declining'
  return 'stable'
}

/** True if every numeric field in the daily records is identical (flat data). */
function allMetricsIdentical(days: DailyRecord[]): boolean {
  const numericValues = days.flatMap((d) => [d.discomfort, d.pain, d.sittingTolerance])
  const defined = numericValues.filter((v): v is number => v != null)
  if (defined.length === 0) return true
  return defined.every((v) => v === defined[0])
}

// ---------------------------------------------------------------------------
// Structured output schema
// ---------------------------------------------------------------------------

const patternInsightsSchema = z.object({
  insights: z
    .array(z.string())
    .describe(
      'Patient-friendly insights about metric correlations and trends. ' +
      'Each element is a single sentence. Use "We notice..." not "You should...".',
    ),
})

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Analyse all historical metrics for a patient and return a list of
 * patient-friendly pattern insights.
 *
 * - Returns an empty array if the patient has fewer than 14 days of data.
 * - Returns a stability message if all metrics are identical across all days.
 * - Otherwise, runs a structured Claude prompt to surface correlations and
 *   trends, returning the results as a `string[]`.
 *
 * Integration: call this inside `generateWeeklyReport` and merge the returned
 * array into `report.insights`:
 *
 * ```ts
 * import { detectPatterns } from './pattern-detection'
 *
 * const patternInsights = await detectPatterns(patientId, supabase)
 * report.insights = [...report.insights, ...patternInsights]
 * ```
 *
 * @param patientId  UUID of the patient
 * @param supabase   Authenticated Supabase client
 */
export async function detectPatterns(
  patientId: string,
  supabase: SupabaseClient<Database>,
): Promise<string[]> {
  // -------------------------------------------------------------------------
  // 1. Load ALL metrics for the patient, ordered oldest → newest
  // -------------------------------------------------------------------------
  const { data, error } = await supabase
    .from('metrics')
    .select(
      'pain_level, discomfort, sitting_tolerance_min, exercises_done, exercise_count, recorded_at',
    )
    .eq('patient_id', patientId)
    .order('recorded_at', { ascending: true })

  if (error) {
    console.error('[pattern-detection] Failed to load metrics', error)
    throw new Error(`Failed to load metrics for pattern detection: ${error.message}`)
  }

  const metrics = (data ?? []) as QueriedMetric[]

  // -------------------------------------------------------------------------
  // 2. Build daily records and check minimum data threshold
  // -------------------------------------------------------------------------
  const days = buildDailyRecords(metrics)

  if (days.length < MIN_DAYS_FOR_PATTERNS) {
    return []
  }

  // -------------------------------------------------------------------------
  // 3. Flat/identical data shortcut
  // -------------------------------------------------------------------------
  if (allMetricsIdentical(days)) {
    return ['Your metrics have been stable — consistency is a good sign.']
  }

  // -------------------------------------------------------------------------
  // 4. Compute pre-analysis statistics for the prompt
  // -------------------------------------------------------------------------
  const correlation = exerciseNextDayCorrelation(days)

  const sittingValues = days.map((d) => d.sittingTolerance)
  const sittingTrend = computeHalfTrend(sittingValues)

  const discomfortValues = days.map((d) => d.discomfort)
  const discomfortTrend = computeHalfTrend(discomfortValues)

  // Weekend vs weekday discomfort split
  const weekdayDiscomfort = days
    .filter((d) => !d.isWeekend && d.discomfort != null)
    .map((d) => d.discomfort!)
  const weekendDiscomfort = days
    .filter((d) => d.isWeekend && d.discomfort != null)
    .map((d) => d.discomfort!)
  const avgWeekdayDiscomfort = avg(weekdayDiscomfort)
  const avgWeekendDiscomfort = avg(weekendDiscomfort)

  const exerciseDays = days.filter((d) => d.exercisesDone).length
  const totalDays = days.length

  // -------------------------------------------------------------------------
  // 5. Build the analysis prompt
  // -------------------------------------------------------------------------
  const dailyDataLines = days
    .slice(-28) // cap at last 28 days to keep prompt concise
    .map(
      (d) =>
        `${d.date}: discomfort=${d.discomfort ?? 'n/a'} pain=${d.pain ?? 'n/a'} ` +
        `sitting=${d.sittingTolerance != null ? `${d.sittingTolerance}min` : 'n/a'} ` +
        `exercises=${d.exercisesDone ? 'yes' : 'no'} weekend=${d.isWeekend ? 'yes' : 'no'}`,
    )
    .join('\n')

  const correlationLines: string[] = []
  if (correlation.afterExercise != null && correlation.afterNoExercise != null) {
    correlationLines.push(
      `After exercise days — avg next-day discomfort: ${round1(correlation.afterExercise)}`,
    )
    correlationLines.push(
      `After no-exercise days — avg next-day discomfort: ${round1(correlation.afterNoExercise)}`,
    )
    correlationLines.push(`Correlation sample pairs: ${correlation.sampleSize}`)
  }

  if (avgWeekdayDiscomfort != null && avgWeekendDiscomfort != null) {
    correlationLines.push(
      `Avg weekday discomfort: ${round1(avgWeekdayDiscomfort)} | Avg weekend discomfort: ${round1(avgWeekendDiscomfort)}`,
    )
  }

  correlationLines.push(`Sitting tolerance trend: ${sittingTrend}`)
  correlationLines.push(`Overall discomfort trend: ${discomfortTrend}`)
  correlationLines.push(`Exercise adherence: ${exerciseDays}/${totalDays} days`)

  const prompt = [
    `Daily metrics for the patient (up to last 28 days):`,
    dailyDataLines,
    '',
    'Pre-computed analysis:',
    correlationLines.join('\n'),
    '',
    'Analyze the following daily metrics and look for correlations:',
    '- Do days with exercises correlate with lower discomfort the next day?',
    '- Do missed exercise/stretching days correlate with higher discomfort the next day?',
    '- Is there a trend in sitting tolerance over time?',
    '- Any other notable patterns (e.g. weekend vs weekday differences)?',
    '',
    'Rules:',
    '- Present insights in patient-friendly language.',
    '- Use "We notice..." not "You should...".',
    '- Each insight must be exactly one sentence.',
    '- Only report patterns supported by the data — do not invent correlations.',
    '- If a correlation is weak or uncertain, caveat it: "This might be related to..."',
    '- Return 2-4 insights total.',
  ].join('\n')

  // -------------------------------------------------------------------------
  // 6. Call Claude with structured output
  // -------------------------------------------------------------------------
  const model = process.env.AI_MODEL || DEFAULT_MODEL

  const { output } = await generateText({
    model: anthropic(model),
    output: Output.object({
      schema: patternInsightsSchema,
      name: 'PatternInsights',
      description: 'Patient-friendly pattern insights derived from historical recovery metrics',
    }),
    system:
      'You are a compassionate physiotherapy assistant analysing patient recovery data. ' +
      'Identify genuine patterns and present them as brief, encouraging observations. ' +
      'Be accurate — only surface correlations clearly visible in the data.',
    prompt,
  })

  return output.insights
}
