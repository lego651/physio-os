import { createAdminClient } from '@/lib/supabase/admin'
import { getWeekStartUTC } from '@/lib/date'
import { PatientList } from './patient-list'
import { OverviewCards } from './overview-cards'

export const dynamic = 'force-dynamic'

export interface PatientWithAggregates {
  id: string
  name: string | null
  phone: string
  language: string
  active: boolean
  opted_out: boolean
  created_at: string
  practitioner_name: string | null
  profile: Record<string, unknown> | null
  last_message_at: string | null
  latest_pain: number | null
  latest_discomfort: number | null
  avg_pain_7d: number | null
  exercise_days_this_week: number
  days_since_last_message: number | null
  status: 'active' | 'inactive' | 'alert' | 'new'
  alert_detail: string | null
}

/** Stats computed from patient data, passed to OverviewCards to avoid duplicate queries. */
export interface OverviewStats {
  totalPatients: number
  activeThisWeek: number
  messagesThisWeek: number
  avgDiscomfortThisWeek: number | null
  avgDiscomfortLastWeek: number | null
}

async function getPatients() {
  const supabase = createAdminClient()
  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const weekStart = getWeekStartUTC(now)
  const lastWeekStart = new Date(weekStart)
  lastWeekStart.setUTCDate(lastWeekStart.getUTCDate() - 7)

  // Fetch patients, messages, and metrics in parallel
  const { data: patients, error } = await supabase
    .from('patients')
    .select('id, name, phone, language, active, opted_out, created_at, practitioner_name, profile')
    .order('created_at', { ascending: false })

  if (error) throw error
  if (!patients || patients.length === 0) {
    return {
      patients: [] as PatientWithAggregates[],
      stats: {
        totalPatients: 0,
        activeThisWeek: 0,
        messagesThisWeek: 0,
        avgDiscomfortThisWeek: null,
        avgDiscomfortLastWeek: null,
      } satisfies OverviewStats,
    }
  }

  const patientIds = patients.map((p) => p.id)
  const weekStartIso = weekStart.toISOString()
  const lastWeekStartIso = lastWeekStart.toISOString()
  const nowIso = now.toISOString()

  const [messagesResult, metricsResult, messagesThisWeekResult, discomfortThisWeekResult, discomfortLastWeekResult] = await Promise.all([
    // Latest message per patient — fetch all but only use first per patient
    supabase
      .from('messages')
      .select('patient_id, created_at')
      .in('patient_id', patientIds)
      .order('created_at', { ascending: false }),

    // All metrics for computations
    supabase
      .from('metrics')
      .select('patient_id, pain_level, discomfort, recorded_at, exercises_done')
      .in('patient_id', patientIds)
      .order('recorded_at', { ascending: false }),

    // Overview: messages this week count
    supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', weekStartIso)
      .lte('created_at', nowIso),

    // Overview: discomfort this week
    supabase
      .from('metrics')
      .select('discomfort')
      .gte('recorded_at', weekStartIso)
      .lte('recorded_at', nowIso)
      .not('discomfort', 'is', null),

    // Overview: discomfort last week
    supabase
      .from('metrics')
      .select('discomfort')
      .gte('recorded_at', lastWeekStartIso)
      .lt('recorded_at', weekStartIso)
      .not('discomfort', 'is', null),
  ])

  const messages = messagesResult.data ?? []
  const metrics = metricsResult.data ?? []

  // Build lookup maps
  const lastMessageMap = new Map<string, string>()
  for (const m of messages) {
    if (!lastMessageMap.has(m.patient_id)) {
      lastMessageMap.set(m.patient_id, m.created_at)
    }
  }

  const latestMetricMap = new Map<string, { pain_level: number | null; discomfort: number | null }>()
  const exerciseDaysMap = new Map<string, Set<string>>()

  for (const m of metrics) {
    if (!latestMetricMap.has(m.patient_id)) {
      latestMetricMap.set(m.patient_id, { pain_level: m.pain_level, discomfort: m.discomfort })
    }

    // Exercise days this week
    if (new Date(m.recorded_at) >= weekStart && m.exercises_done && m.exercises_done.length > 0) {
      const day = new Date(m.recorded_at).toISOString().slice(0, 10)
      if (!exerciseDaysMap.has(m.patient_id)) exerciseDaysMap.set(m.patient_id, new Set())
      exerciseDaysMap.get(m.patient_id)!.add(day)
    }
  }

  // Compute 7-day average pain per patient
  const painSums = new Map<string, { sum: number; count: number }>()
  for (const m of metrics) {
    if (new Date(m.recorded_at) >= sevenDaysAgo && m.pain_level != null) {
      const entry = painSums.get(m.patient_id) ?? { sum: 0, count: 0 }
      entry.sum += m.pain_level
      entry.count += 1
      painSums.set(m.patient_id, entry)
    }
  }
  const avgPain7dMap = new Map<string, number>()
  for (const [pid, { sum, count }] of painSums) {
    avgPain7dMap.set(pid, sum / count)
  }

  // Compute overview stats
  const activePatientIds = new Set<string>()
  for (const m of messages) {
    if (new Date(m.created_at) >= weekStart) {
      activePatientIds.add(m.patient_id)
    }
  }

  function avgDiscomfort(rows: { discomfort: number | null }[]): number | null {
    const values = rows.map((r) => r.discomfort).filter((v): v is number => v !== null)
    if (values.length === 0) return null
    return values.reduce((sum, v) => sum + v, 0) / values.length
  }

  const stats: OverviewStats = {
    totalPatients: patients.filter((p) => p.active).length,
    activeThisWeek: activePatientIds.size,
    messagesThisWeek: messagesThisWeekResult.count ?? 0,
    avgDiscomfortThisWeek: avgDiscomfort(discomfortThisWeekResult.data ?? []),
    avgDiscomfortLastWeek: avgDiscomfort(discomfortLastWeekResult.data ?? []),
  }

  const patientList = patients.map((p) => {
    const lastMsg = lastMessageMap.get(p.id)
    const latestMetric = latestMetricMap.get(p.id)
    const avgPain = avgPain7dMap.get(p.id)
    const exerciseDays = exerciseDaysMap.get(p.id)?.size ?? 0

    const daysSinceMsg = lastMsg
      ? Math.floor((now.getTime() - new Date(lastMsg).getTime()) / (1000 * 60 * 60 * 24))
      : null

    const daysSinceCreated = Math.floor(
      (now.getTime() - new Date(p.created_at).getTime()) / (1000 * 60 * 60 * 24)
    )

    // Determine status
    let status: PatientWithAggregates['status'] = 'active'
    let alertDetail: string | null = null

    // Check alert: pain spike >= 2 above 7-day average
    const latestPain = latestMetric?.pain_level ?? null
    const painCount = painSums.get(p.id)?.count ?? 0
    if (latestPain != null && avgPain != null && painCount > 1) {
      const delta = latestPain - avgPain
      if (delta >= 2) {
        status = 'alert'
        alertDetail = `Pain ${latestPain} reported — avg is ${avgPain.toFixed(1)} (▲ ${delta.toFixed(1)} above average)`
      }
    }

    // Check inactive (5+ days) — only if not already alert
    if (status !== 'alert') {
      const inactiveDays = daysSinceMsg ?? daysSinceCreated
      if (inactiveDays >= 5) {
        status = 'inactive'
      }
    }

    // Check new (enrolled within last 7 days) — override inactive if new
    if (daysSinceCreated <= 7 && status !== 'alert') {
      status = 'new'
    }

    return {
      id: p.id,
      name: p.name,
      phone: p.phone,
      language: p.language,
      active: p.active,
      opted_out: p.opted_out,
      created_at: p.created_at,
      practitioner_name: p.practitioner_name,
      profile: p.profile as Record<string, unknown> | null,
      last_message_at: lastMsg ?? null,
      latest_pain: latestPain,
      latest_discomfort: latestMetric?.discomfort ?? null,
      avg_pain_7d: avgPain ?? null,
      exercise_days_this_week: exerciseDays,
      days_since_last_message: daysSinceMsg,
      status,
      alert_detail: alertDetail,
    }
  })

  return { patients: patientList, stats }
}

export default async function PatientsPage() {
  const { patients, stats } = await getPatients()
  return (
    <div className="space-y-6">
      <OverviewCards stats={stats} />
      <PatientList patients={patients} />
    </div>
  )
}
