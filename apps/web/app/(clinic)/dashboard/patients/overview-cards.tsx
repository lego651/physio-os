import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { createAdminClient } from '@/lib/supabase/admin'
import { MessageSquare, Minus, TrendingDown, TrendingUp, UserCheck, Users } from 'lucide-react'

/** Returns the ISO string for the most recent Monday at 00:00:00 UTC */
function getMondayOf(date: Date): Date {
  const d = new Date(date)
  const day = d.getUTCDay() // 0 = Sunday, 1 = Monday, ...
  const diff = day === 0 ? -6 : 1 - day
  d.setUTCDate(d.getUTCDate() + diff)
  d.setUTCHours(0, 0, 0, 0)
  return d
}

export async function OverviewCards() {
  const supabase = createAdminClient()

  const now = new Date()
  const thisMonday = getMondayOf(now)
  const lastMonday = new Date(thisMonday)
  lastMonday.setUTCDate(lastMonday.getUTCDate() - 7)

  const thisMondayIso = thisMonday.toISOString()
  const lastMondayIso = lastMonday.toISOString()
  const nowIso = now.toISOString()

  // Run all queries in parallel
  const [
    totalResult,
    activeThisWeekResult,
    messagesThisWeekResult,
    metricsThisWeekResult,
    metricsLastWeekResult,
  ] = await Promise.all([
    // 1. Total active patients
    supabase
      .from('patients')
      .select('id', { count: 'exact', head: true })
      .eq('active', true),

    // 2. Distinct patients with messages this week
    supabase
      .from('messages')
      .select('patient_id')
      .gte('created_at', thisMondayIso)
      .lte('created_at', nowIso),

    // 3. Total messages this week
    supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', thisMondayIso)
      .lte('created_at', nowIso),

    // 4. Discomfort values this week
    supabase
      .from('metrics')
      .select('discomfort')
      .gte('recorded_at', thisMondayIso)
      .lte('recorded_at', nowIso)
      .not('discomfort', 'is', null),

    // 5. Discomfort values last week
    supabase
      .from('metrics')
      .select('discomfort')
      .gte('recorded_at', lastMondayIso)
      .lt('recorded_at', thisMondayIso)
      .not('discomfort', 'is', null),
  ])

  // 1. Total patients
  const totalPatients = totalResult.count ?? 0

  // 2. Active this week — distinct patient_ids
  const activePatientIds = new Set(
    (activeThisWeekResult.data ?? []).map((r) => r.patient_id),
  )
  const activeThisWeek = activePatientIds.size

  // 3. Messages this week
  const messagesThisWeek = messagesThisWeekResult.count ?? 0

  // 4 & 5. Avg discomfort trend
  function avgDiscomfort(rows: { discomfort: number | null }[]): number | null {
    const values = rows.map((r) => r.discomfort).filter((v): v is number => v !== null)
    if (values.length === 0) return null
    return values.reduce((sum, v) => sum + v, 0) / values.length
  }

  const avgThis = avgDiscomfort(metricsThisWeekResult.data ?? [])
  const avgLast = avgDiscomfort(metricsLastWeekResult.data ?? [])

  type Trend = 'improving' | 'worsening' | 'neutral'
  let trend: Trend = 'neutral'
  if (avgThis !== null && avgLast !== null) {
    if (avgThis < avgLast) trend = 'improving'
    else if (avgThis > avgLast) trend = 'worsening'
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
            {avgThis !== null ? avgThis.toFixed(1) : '—'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{trendLabel} vs last week</p>
        </CardContent>
      </Card>
    </div>
  )
}
