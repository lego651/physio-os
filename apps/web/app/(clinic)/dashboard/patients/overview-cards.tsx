import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { MessageSquare, Minus, TrendingDown, TrendingUp, UserCheck, Users } from 'lucide-react'
import type { OverviewStats } from './page'

export function OverviewCards({ stats }: { stats: OverviewStats }) {
  const { totalPatients, activeThisWeek, messagesThisWeek, avgDiscomfortThisWeek, avgDiscomfortLastWeek } = stats

  type Trend = 'improving' | 'worsening' | 'neutral'
  let trend: Trend = 'neutral'
  if (avgDiscomfortThisWeek !== null && avgDiscomfortLastWeek !== null) {
    if (avgDiscomfortThisWeek < avgDiscomfortLastWeek) trend = 'improving'
    else if (avgDiscomfortThisWeek > avgDiscomfortLastWeek) trend = 'worsening'
  }

  const TrendIcon =
    trend === 'improving' ? TrendingDown : trend === 'worsening' ? TrendingUp : Minus

  const trendColor =
    trend === 'improving'
      ? 'text-green-600'
      : trend === 'worsening'
        ? 'text-red-500'
        : 'text-muted-foreground'

  const trendLabel =
    trend === 'improving'
      ? 'Improving'
      : trend === 'worsening'
        ? 'Worsening'
        : 'No change'

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {/* Card 1 — Total Patients */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Total Patients
          </CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <p className="font-mono text-3xl font-semibold tabular-nums">{totalPatients}</p>
          <p className="mt-1 text-xs text-muted-foreground">active</p>
        </CardContent>
      </Card>

      {/* Card 2 — Active This Week */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Active This Week
          </CardTitle>
          <UserCheck className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <p className="font-mono text-3xl font-semibold tabular-nums">{activeThisWeek}</p>
          <p className="mt-1 text-xs text-muted-foreground">patients messaged</p>
        </CardContent>
      </Card>

      {/* Card 3 — Messages This Week */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Messages This Week
          </CardTitle>
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <p className="font-mono text-3xl font-semibold tabular-nums">{messagesThisWeek}</p>
          <p className="mt-1 text-xs text-muted-foreground">total messages</p>
        </CardContent>
      </Card>

      {/* Card 4 — Avg Discomfort Trend */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Avg Discomfort Trend
          </CardTitle>
          <TrendIcon className={cn('h-4 w-4', trendColor)} />
        </CardHeader>
        <CardContent>
          <p className={cn('font-mono text-3xl font-semibold tabular-nums', trendColor)}>
            {avgDiscomfortThisWeek !== null ? avgDiscomfortThisWeek.toFixed(1) : '—'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{trendLabel} vs last week</p>
        </CardContent>
      </Card>
    </div>
  )
}
