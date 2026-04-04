import { jwtVerify } from 'jose'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { createServiceClient } from '@/lib/supabase/server'
import type { Database } from '@physio-os/shared'
import { DiscomfortChart } from './discomfort-chart'
import type { DailyDiscomfortPoint } from './discomfort-chart'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MetricsSummary {
  avgPain: number | null
  avgDiscomfort: number | null
  avgSittingTolerance: number | null
  exerciseDays: number
  totalDays: number
  painTrend: 'improving' | 'stable' | 'worsening'
  discomfortTrend: 'improving' | 'stable' | 'worsening'
}

type Report = Database['public']['Tables']['reports']['Row']
type Patient = Database['public']['Tables']['patients']['Row']
type MetricRow = Database['public']['Tables']['metrics']['Row']

interface TokenPayload {
  reportId: string
  patientId: string
}

// ---------------------------------------------------------------------------
// Date helpers (no date-fns — use native Intl/Date)
// ---------------------------------------------------------------------------

/** Parse an ISO date string (YYYY-MM-DD) as UTC midnight, returns a Date */
function parseISODate(iso: string): Date {
  // Split to avoid timezone shifts from `new Date('YYYY-MM-DD')`
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

/** Add days to a Date, returns a new Date */
function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setUTCDate(result.getUTCDate() + days)
  return result
}

/** Format a Date as "Mar 24" */
function formatShort(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

/** Format week range string: "Mar 24 – Mar 30, 2026" */
function formatWeekRange(weekStart: string): string {
  const start = parseISODate(weekStart)
  const end = addDays(start, 6)
  const endStr = end.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
  return `${formatShort(start)} – ${endStr}`
}

/** Format a Date as YYYY-MM-DD (UTC) */
function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------
// Other helpers
// ---------------------------------------------------------------------------

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function trendArrow(trend: 'improving' | 'stable' | 'worsening') {
  if (trend === 'improving') return { symbol: '↓', color: '#16A34A' }
  if (trend === 'worsening') return { symbol: '↑', color: '#DC2626' }
  return { symbol: '→', color: '#6B7280' }
}

// ---------------------------------------------------------------------------
// Error / expired page
// ---------------------------------------------------------------------------

function ExpiredTokenPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
      <div className="max-w-sm space-y-4">
        <div
          className="mx-auto flex h-14 w-14 items-center justify-center rounded-full"
          style={{ backgroundColor: '#F0FDF4' }}
        >
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#16A34A"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4" />
            <path d="M12 16h.01" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-foreground">Report Expired</h1>
        <p className="text-muted-foreground">
          This report has expired. Open your chat to see your progress.
        </p>
        <Link href="/chat">
          <Button className="mt-2 w-full" style={{ backgroundColor: '#0F766E' }}>
            Open Chat
          </Button>
        </Link>
      </div>
    </main>
  )
}

// ---------------------------------------------------------------------------
// Metric card
// ---------------------------------------------------------------------------

interface MetricCardProps {
  label: string
  value: number
  unit?: string
  color: string
  trend?: 'improving' | 'stable' | 'worsening'
}

function MetricCard({ label, value, unit, color, trend }: MetricCardProps) {
  const arrow = trend ? trendArrow(trend) : null
  const displayValue = Number.isInteger(value) ? String(value) : value.toFixed(1)

  return (
    <Card className="flex-1">
      <CardContent className="flex flex-col items-center gap-1 py-4">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className="font-mono text-3xl font-bold leading-none" style={{ color }}>
          {displayValue}
          {unit && (
            <span className="font-sans text-base font-normal text-muted-foreground">{unit}</span>
          )}
        </span>
        {arrow && (
          <span
            className="text-lg font-semibold leading-none"
            style={{ color: arrow.color }}
            aria-label={trend}
          >
            {arrow.symbol}
          </span>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Exercise progress bar
// ---------------------------------------------------------------------------

function ExerciseProgress({ days, total }: { days: number; total: number }) {
  const pct = Math.min(100, Math.round((days / total) * 100))
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">Exercise</span>
        <span className="font-mono text-sm font-semibold" style={{ color: '#16A34A' }}>
          {days} of {total} days
        </span>
      </div>
      <div
        className="h-3 w-full overflow-hidden rounded-full"
        style={{ backgroundColor: '#DCFCE7' }}
        role="progressbar"
        aria-valuenow={days}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label={`${days} of ${total} exercise days`}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: '#16A34A' }}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function ReportPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  // 1. Verify JWT
  const secret = process.env.REPORT_TOKEN_SECRET
  if (!secret) {
    console.error('[report-page] Missing REPORT_TOKEN_SECRET')
    return <ExpiredTokenPage />
  }

  let payload: TokenPayload
  try {
    const { payload: raw } = await jwtVerify(token, new TextEncoder().encode(secret))
    payload = raw as unknown as TokenPayload
  } catch {
    // Covers expired, tampered, or malformed tokens
    return <ExpiredTokenPage />
  }

  // 2. Load report (with patient name) from DB by matching the token column
  const supabase = await createServiceClient()

  const { data: reportRaw } = await supabase
    .from('reports')
    .select('*, patients(name)')
    .eq('token', token)
    .single()

  const report = reportRaw as (Report & { patients: Pick<Patient, 'name'> | null }) | null

  if (!report) {
    return <ExpiredTokenPage />
  }

  // 3. Fetch daily discomfort metrics for the chart
  const weekStart = report.week_start
  const weekEndDate = addDays(parseISODate(weekStart), 6)
  const weekEnd = toISODate(weekEndDate)

  const { data: dailyRowsRaw } = await supabase
    .from('metrics')
    .select('recorded_at, discomfort')
    .eq('patient_id', payload.patientId)
    .gte('recorded_at', weekStart)
    .lte('recorded_at', weekEnd + 'T23:59:59Z')

  const dailyRows = dailyRowsRaw as Pick<MetricRow, 'recorded_at' | 'discomfort'>[] | null

  // Group by day-of-week index (0=Mon … 6=Sun)
  const discomfortByDay = new Map<number, number[]>()
  for (const row of dailyRows ?? []) {
    const date = new Date(row.recorded_at)
    // getUTCDay(): 0=Sun … 6=Sat → shift so 0=Mon … 6=Sun
    const dayIndex = (date.getUTCDay() + 6) % 7
    if (row.discomfort !== null) {
      const arr = discomfortByDay.get(dayIndex) ?? []
      arr.push(row.discomfort)
      discomfortByDay.set(dayIndex, arr)
    }
  }

  const chartData: DailyDiscomfortPoint[] = DAYS.map((day, i) => {
    const vals = discomfortByDay.get(i)
    const avg =
      vals && vals.length > 0
        ? parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2))
        : null
    return { day, discomfort: avg }
  })

  // CTA always points to /chat — middleware handles auth redirect if needed.
  // This page is accessed via SMS links where users won't have session cookies.
  const ctaHref = '/chat'

  // 5. Parse metrics_summary and resolve patient name
  const metrics = report.metrics_summary as MetricsSummary | null
  const firstName = (report.patients?.name ?? 'there').split(' ')[0]
  const insights: string[] = Array.isArray(report.insights) ? report.insights : []
  const hasChartData = chartData.some((d) => d.discomfort !== null)

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-md px-4 py-8 space-y-6">

        {/* ── Header ── */}
        <header className="space-y-1">
          <div className="flex items-center gap-2">
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
              style={{ backgroundColor: '#0F766E' }}
              aria-label="V-Health logo"
            >
              V
            </div>
            <span className="font-semibold text-foreground">V-Health</span>
          </div>
          <h1 className="text-xl font-semibold text-foreground">Weekly Recovery Report</h1>
          <p className="text-sm text-muted-foreground">{formatWeekRange(weekStart)}</p>
        </header>

        {/* ── Summary narrative ── */}
        <section className="space-y-1">
          <p className="text-base font-medium text-foreground">Hi {firstName},</p>
          {report.summary && (
            <p className="text-sm leading-relaxed text-muted-foreground">{report.summary}</p>
          )}
        </section>

        {/* ── Metric cards ── */}
        {metrics && (
          <section aria-label="Weekly metrics" className="space-y-3">
            {/* Pain + Discomfort side by side */}
            {(metrics.avgPain !== null || metrics.avgDiscomfort !== null) && (
              <div className="flex gap-3">
                {metrics.avgPain !== null && (
                  <MetricCard
                    label="Pain"
                    value={metrics.avgPain}
                    color="#DC2626"
                    trend={metrics.painTrend}
                  />
                )}
                {metrics.avgDiscomfort !== null && (
                  <MetricCard
                    label="Discomfort"
                    value={metrics.avgDiscomfort}
                    color="#F59E0B"
                    trend={metrics.discomfortTrend}
                  />
                )}
              </div>
            )}
            {/* Sitting tolerance — half width (consistent card sizing) */}
            {metrics.avgSittingTolerance !== null && (
              <div className="flex gap-3">
                <MetricCard
                  label="Sitting Tolerance"
                  value={metrics.avgSittingTolerance}
                  unit=" min"
                  color="#0F766E"
                />
                {/* Spacer to keep card at ~50% width when alone */}
                <div className="flex-1" aria-hidden="true" />
              </div>
            )}
          </section>
        )}

        {/* ── Exercise progress ── */}
        {metrics && (
          <section>
            <ExerciseProgress days={metrics.exerciseDays} total={7} />
          </section>
        )}

        {/* ── 7-day discomfort chart ── */}
        {hasChartData && (
          <section className="space-y-2">
            <h2 className="text-sm font-medium text-foreground">7-day discomfort trend</h2>
            <DiscomfortChart data={chartData} />
          </section>
        )}

        {/* ── Insights ── */}
        {insights.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-medium text-foreground">Insights</h2>
            <ul className="space-y-1.5">
              {insights.map((insight, i) => (
                <li key={`${i}-${insight.slice(0, 20)}`} className="flex gap-2 text-sm text-muted-foreground">
                  <span className="mt-0.5 shrink-0" style={{ color: '#0F766E' }} aria-hidden="true">
                    •
                  </span>
                  <span>{insight}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── CTA ── */}
        <section className="pt-2 pb-4">
          <Link href={ctaHref} className="block w-full md:inline-block md:w-auto">
            <Button
              className="w-full md:w-auto text-white"
              size="lg"
              style={{ backgroundColor: '#0F766E' }}
            >
              Open Chat →
            </Button>
          </Link>
        </section>

      </div>
    </main>
  )
}
