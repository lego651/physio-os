import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Activity, TrendingDown, Clock, Dumbbell } from 'lucide-react'
import { getWeekStartUTC } from '@/lib/date'
import type { MetricRow } from './page'

export function MetricOverviewCards({ metrics }: { metrics: MetricRow[] }) {
  const now = new Date()
  const weekStart = getWeekStartUTC(now)

  const thisWeek = metrics.filter((m) => new Date(m.recorded_at) >= weekStart)

  // Average pain this week
  const painValues = thisWeek.map((m) => m.pain_level).filter((v): v is number => v != null)
  const avgPain = painValues.length > 0 ? painValues.reduce((a, b) => a + b, 0) / painValues.length : null

  // Average discomfort this week
  const discomfortValues = thisWeek.map((m) => m.discomfort).filter((v): v is number => v != null)
  const avgDiscomfort = discomfortValues.length > 0
    ? discomfortValues.reduce((a, b) => a + b, 0) / discomfortValues.length
    : null

  // Average sitting tolerance this week
  const sittingValues = thisWeek.map((m) => m.sitting_tolerance_min).filter((v): v is number => v != null)
  const avgSitting = sittingValues.length > 0
    ? sittingValues.reduce((a, b) => a + b, 0) / sittingValues.length
    : null

  // Exercise completion: unique days with exercises this week
  const exerciseDays = new Set(
    thisWeek
      .filter((m) => m.exercises_done && m.exercises_done.length > 0)
      .map((m) => new Date(m.recorded_at).toISOString().slice(0, 10))
  ).size

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <OverviewCard
        icon={<Activity className="h-4 w-4 text-red-500" />}
        label="Avg Pain"
        value={avgPain != null ? avgPain.toFixed(1) : '—'}
        color="text-red-600 dark:text-red-400"
      />
      <OverviewCard
        icon={<TrendingDown className="h-4 w-4 text-amber-500" />}
        label="Avg Discomfort"
        value={avgDiscomfort != null ? avgDiscomfort.toFixed(1) : '—'}
        color="text-amber-600 dark:text-amber-400"
      />
      <OverviewCard
        icon={<Clock className="h-4 w-4 text-teal-500" />}
        label="Avg Sitting (min)"
        value={avgSitting != null ? Math.round(avgSitting).toString() : '—'}
        color="text-teal-600 dark:text-teal-400"
      />
      <OverviewCard
        icon={<Dumbbell className="h-4 w-4 text-green-500" />}
        label="Exercise Days"
        value={`${exerciseDays}/7`}
        color="text-green-600 dark:text-green-400"
        progress={exerciseDays / 7}
      />
    </div>
  )
}

function OverviewCard({
  icon,
  label,
  value,
  color,
  progress,
}: {
  icon: React.ReactNode
  label: string
  value: string
  color: string
  progress?: number
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          {icon}
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className={`font-mono text-2xl font-bold ${color}`}>{value}</p>
        {progress != null && (
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-green-500 transition-all"
              style={{ width: `${Math.min(progress * 100, 100)}%` }}
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
