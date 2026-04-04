import { generateText, Output } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'
import { SignJWT } from 'jose'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@physio-os/shared'
import { detectPatterns } from './pattern-detection'
import { avg, round1, countExerciseDays, type QueriedMetric } from './utils'

type PatientRow = Database['public']['Tables']['patients']['Row']
type MessageRow = Database['public']['Tables']['messages']['Row']
type ReportRow = Database['public']['Tables']['reports']['Row']

type Trend = 'improving' | 'stable' | 'worsening'

/** Convenience alias for the full Report shape returned to callers */
export type Report = ReportRow

const MAX_SUMMARY_CHARS = 500
const DEFAULT_MODEL = 'claude-sonnet-4.5'

/**
 * Compare this week's average to last week's for a "bad" metric (lower = better).
 * Returns 'stable' when there is no previous-week data.
 */
function calcTrend(thisVals: number[], lastVals: number[]): Trend {
  const thisAvg = avg(thisVals)
  const lastAvg = avg(lastVals)
  if (thisAvg == null || lastAvg == null) return 'stable'
  const delta = thisAvg - lastAvg
  if (delta < -0.5) return 'improving'
  if (delta > 0.5) return 'worsening'
  return 'stable'
}

/**
 * Sign a short-lived JWT token for the report using `jose`.
 * Secret is read from REPORT_TOKEN_SECRET env var.
 */
async function signReportToken(reportId: string, patientId: string): Promise<string> {
  const secret = process.env.REPORT_TOKEN_SECRET
  if (!secret) throw new Error('REPORT_TOKEN_SECRET environment variable is not set')

  const encoder = new TextEncoder()
  const exp = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60 // 7 days

  return new SignJWT({ reportId, patientId })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(exp)
    .sign(encoder.encode(secret))
}

// ---------------------------------------------------------------------------
// Zod schema for structured AI output
// ---------------------------------------------------------------------------

const reportOutputSchema = z.object({
  summary: z.string().describe('2-3 sentence narrative summary of the patient\'s recovery progress'),
  metricsSummary: z.object({
    avgPain: z.number().nullable().describe('Average pain level for the week (1-10 scale), null if no data'),
    avgDiscomfort: z.number().nullable().describe('Average discomfort for the week (0-3 scale), null if no data'),
    avgSittingTolerance: z.number().nullable().describe('Average sitting tolerance in minutes, null if no data'),
    exerciseDays: z.number().int().describe('Number of days exercises were completed'),
    totalDays: z.literal(7).describe('Always 7 — the full week window'),
    painTrend: z.enum(['improving', 'stable', 'worsening']).describe('Week-over-week pain trend'),
    discomfortTrend: z.enum(['improving', 'stable', 'worsening']).describe('Week-over-week discomfort trend'),
  }),
  insights: z.array(z.string()).describe('List of notable patterns or observations for the week'),
})

type ReportOutput = z.infer<typeof reportOutputSchema>

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Generate a weekly recovery report for a patient using AI.
 *
 * - Loads metrics, messages, and patient profile for the given week.
 * - Calls Claude with a structured prompt to produce a narrative summary,
 *   metrics breakdown, and pattern insights.
 * - Signs a JWT report token and persists the report row to the `reports` table.
 * - Returns null if there are no metrics for the week (nothing to summarise).
 *
 * @param patientId  UUID of the patient
 * @param weekStart  Monday (00:00 UTC) of the week to report on
 * @param supabase   Authenticated Supabase client
 */
export async function generateWeeklyReport(
  patientId: string,
  weekStart: Date,
  supabase: SupabaseClient<Database>,
): Promise<Report | null> {
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000)
  const prevWeekStart = new Date(weekStart.getTime() - 7 * 24 * 60 * 60 * 1000)

  // -------------------------------------------------------------------------
  // 1. Load data in parallel
  // -------------------------------------------------------------------------
  const [metricsResult, prevMetricsResult, messagesResult, patientResult] = await Promise.all([
    supabase
      .from('metrics')
      .select(
        'pain_level, discomfort, sitting_tolerance_min, exercises_done, exercise_count, recorded_at',
      )
      .eq('patient_id', patientId)
      .gte('recorded_at', weekStart.toISOString())
      .lt('recorded_at', weekEnd.toISOString())
      .order('recorded_at', { ascending: true }),

    supabase
      .from('metrics')
      .select(
        'pain_level, discomfort, sitting_tolerance_min, exercises_done, exercise_count, recorded_at',
      )
      .eq('patient_id', patientId)
      .gte('recorded_at', prevWeekStart.toISOString())
      .lt('recorded_at', weekStart.toISOString()),

    supabase
      .from('messages')
      .select('role, content, created_at')
      .eq('patient_id', patientId)
      .gte('created_at', weekStart.toISOString())
      .lt('created_at', weekEnd.toISOString())
      .order('created_at', { ascending: true }),

    supabase
      .from('patients')
      .select('name, language, profile')
      .eq('id', patientId)
      .single(),
  ])

  if (metricsResult.error) {
    console.error('[generate-report] Failed to load metrics', metricsResult.error)
    throw new Error(`Failed to load metrics: ${metricsResult.error.message}`)
  }
  if (patientResult.error) {
    console.error('[generate-report] Failed to load patient', patientResult.error)
    throw new Error(`Failed to load patient: ${patientResult.error.message}`)
  }

  const metrics = (metricsResult.data ?? []) as QueriedMetric[]
  const prevMetrics = (prevMetricsResult.data ?? []) as QueriedMetric[]
  const patient = patientResult.data as Pick<PatientRow, 'name' | 'language' | 'profile'>
  const messages = (messagesResult.data ?? []) as Pick<MessageRow, 'role' | 'content' | 'created_at'>[]

  // -------------------------------------------------------------------------
  // 2. Skip if zero data points
  // -------------------------------------------------------------------------
  if (metrics.length === 0) return null

  // -------------------------------------------------------------------------
  // 3. Compute aggregated stats
  // -------------------------------------------------------------------------
  const painVals = metrics.map((r) => r.pain_level).filter((v): v is number => v != null)
  const discVals = metrics.map((r) => r.discomfort).filter((v): v is number => v != null)
  const sitVals = metrics.map((r) => r.sitting_tolerance_min).filter((v): v is number => v != null)

  const prevPainVals = prevMetrics.map((r) => r.pain_level).filter((v): v is number => v != null)
  const prevDiscVals = prevMetrics.map((r) => r.discomfort).filter((v): v is number => v != null)

  const avgPain = avg(painVals)
  const avgDiscomfort = avg(discVals)
  const avgSittingTolerance = avg(sitVals)
  const exerciseDays = countExerciseDays(metrics)
  const painTrend = calcTrend(painVals, prevPainVals)
  const discomfortTrend = calcTrend(discVals, prevDiscVals)
  const limitedData = metrics.length < 3

  // -------------------------------------------------------------------------
  // 4. Build prompt context
  // -------------------------------------------------------------------------
  const language = patient.language ?? 'en'
  const patientName = patient.name ?? 'the patient'
  const weekLabel = weekStart.toISOString().slice(0, 10)

  const statsLines: string[] = [
    `Week: ${weekLabel}`,
    `Data points: ${metrics.length} (${limitedData ? 'LIMITED DATA — fewer than 3 days' : 'sufficient'})`,
    avgPain != null ? `Avg pain: ${round1(avgPain)}/10 (trend vs last week: ${painTrend})` : 'Avg pain: no data',
    avgDiscomfort != null ? `Avg discomfort: ${round1(avgDiscomfort)}/3 (trend vs last week: ${discomfortTrend})` : 'Avg discomfort: no data',
    avgSittingTolerance != null ? `Avg sitting tolerance: ${Math.round(avgSittingTolerance)} min` : 'Avg sitting tolerance: no data',
    `Exercise adherence: ${exerciseDays}/7 days`,
  ]

  if (prevMetrics.length === 0) {
    statsLines.push('Previous week: no prior data — this is a baseline week')
  }

  const recentMessages = messages
    .filter((m) => m.role === 'user')
    .slice(-10)
    .map((m) => `[${m.created_at.slice(0, 10)}] ${m.content}`)
    .join('\n')

  const userPrompt = [
    `Patient: ${patientName}`,
    '',
    'Weekly stats:',
    statsLines.join('\n'),
    '',
    recentMessages.length > 0
      ? `Recent patient messages (last ${Math.min(messages.length, 10)}):\n${recentMessages}`
      : 'No messages this week.',
    '',
    limitedData
      ? 'NOTE: Limited data this week — include the note "Based on limited data this week" in the summary.'
      : '',
    '',
    `Generate the report in ${language === 'zh' ? 'Chinese (Traditional)' : 'English'}.`,
    'Summarize recovery progress. Include: overall trend, key metrics, notable patterns, encouragement.',
    'Use the exact pain/discomfort trend values provided above in metricsSummary.',
  ]
    .filter((l) => l !== undefined)
    .join('\n')
    .trim()

  // -------------------------------------------------------------------------
  // 5. Call Claude with generateText + Output.object (non-deprecated v6 API)
  // -------------------------------------------------------------------------
  const model = process.env.AI_MODEL || DEFAULT_MODEL

  const { output } = await generateText({
    model: anthropic(model),
    output: Output.object({
      schema: reportOutputSchema,
      name: 'WeeklyReport',
      description: 'Structured weekly recovery report for a physiotherapy patient',
    }),
    system:
      'You are a compassionate physiotherapy assistant generating weekly progress reports. ' +
      'Be encouraging, accurate, and concise. Use only the data provided — do not invent metrics.',
    prompt: userPrompt,
  })

  const result: ReportOutput = output

  // -------------------------------------------------------------------------
  // 6. Override trend values with our own computed values to ensure accuracy
  // -------------------------------------------------------------------------
  result.metricsSummary.painTrend = painTrend
  result.metricsSummary.discomfortTrend = discomfortTrend
  result.metricsSummary.avgPain = avgPain != null ? round1(avgPain) : null
  result.metricsSummary.avgDiscomfort = avgDiscomfort != null ? round1(avgDiscomfort) : null
  result.metricsSummary.avgSittingTolerance = avgSittingTolerance != null ? Math.round(avgSittingTolerance) : null
  result.metricsSummary.exerciseDays = exerciseDays

  // -------------------------------------------------------------------------
  // 7. Run pattern detection (14+ days of data) and merge insights
  // -------------------------------------------------------------------------
  try {
    const patternInsights = await detectPatterns(patientId, supabase)
    if (patternInsights.length > 0) {
      result.insights = [...result.insights, ...patternInsights]
    }
  } catch (err) {
    console.error('[generate-report] Pattern detection failed, continuing without', err)
  }

  // -------------------------------------------------------------------------
  // 8. Truncate summary if needed
  // -------------------------------------------------------------------------
  if (result.summary.length > MAX_SUMMARY_CHARS) {
    result.summary = result.summary.slice(0, MAX_SUMMARY_CHARS - 1) + '\u2026'
  }

  // -------------------------------------------------------------------------
  // 9. Generate a temporary report ID for the token, then insert
  //    We need the DB-assigned id so we insert first without token,
  //    then update with the signed token.
  // -------------------------------------------------------------------------

  // Insert a placeholder row to get the DB-assigned id
  const { data: insertedRow, error: insertError } = await supabase
    .from('reports')
    .insert({
      patient_id: patientId,
      week_start: weekStart.toISOString().slice(0, 10),
      summary: result.summary,
      metrics_summary: result.metricsSummary,
      insights: result.insights,
      // token must be UNIQUE NOT NULL — use a placeholder that will be replaced
      token: `pending-${patientId}-${weekStart.toISOString().slice(0, 10)}-${Date.now()}`,
    })
    .select('id, patient_id, week_start, summary, metrics_summary, insights, token, created_at')
    .single()

  if (insertError || !insertedRow) {
    console.error('[generate-report] Failed to insert report', insertError)
    throw new Error(`Failed to insert report: ${insertError?.message ?? 'no row returned'}`)
  }

  // Sign the token now that we have the real report id
  const signedToken = await signReportToken(insertedRow.id, patientId)

  const { data: finalRow, error: updateError } = await supabase
    .from('reports')
    .update({ token: signedToken })
    .eq('id', insertedRow.id)
    .select('id, patient_id, week_start, summary, metrics_summary, insights, token, created_at')
    .single()

  if (updateError || !finalRow) {
    console.error('[generate-report] Failed to update report token', updateError)
    throw new Error(`Failed to update report token: ${updateError?.message ?? 'no row returned'}`)
  }

  return finalRow as Report
}
