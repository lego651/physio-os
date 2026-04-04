import { createAdminClient } from '@/lib/supabase/admin'
import { PatientList } from './patient-list'

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

async function getPatients(): Promise<PatientWithAggregates[]> {
  const supabase = createAdminClient()
  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const weekStart = getWeekStart(now)

  // Fetch patients
  const { data: patients, error } = await supabase
    .from('patients')
    .select('id, name, phone, language, active, opted_out, created_at, practitioner_name, profile')
    .order('created_at', { ascending: false })

  if (error) throw error
  if (!patients || patients.length === 0) return []

  const patientIds = patients.map((p) => p.id)

  // Fetch last message per patient
  const { data: messages } = await supabase
    .from('messages')
    .select('patient_id, created_at')
    .in('patient_id', patientIds)
    .order('created_at', { ascending: false })

  // Fetch latest metrics per patient
  const { data: metrics } = await supabase
    .from('metrics')
    .select('patient_id, pain_level, discomfort, recorded_at, exercises_done')
    .in('patient_id', patientIds)
    .order('recorded_at', { ascending: false })

  // Build lookup maps
  const lastMessageMap = new Map<string, string>()
  for (const m of messages ?? []) {
    if (!lastMessageMap.has(m.patient_id)) {
      lastMessageMap.set(m.patient_id, m.created_at)
    }
  }

  const latestMetricMap = new Map<string, { pain_level: number | null; discomfort: number | null }>()
  const avgPain7dMap = new Map<string, number>()
  const exerciseDaysMap = new Map<string, Set<string>>()

  for (const m of metrics ?? []) {
    // Latest metric
    if (!latestMetricMap.has(m.patient_id)) {
      latestMetricMap.set(m.patient_id, { pain_level: m.pain_level, discomfort: m.discomfort })
    }

    // 7-day average pain
    if (new Date(m.recorded_at) >= sevenDaysAgo && m.pain_level != null) {
      const existing = avgPain7dMap.get(m.patient_id)
      if (existing === undefined) {
        avgPain7dMap.set(m.patient_id, m.pain_level)
      } else {
        // We'll compute properly below
      }
    }

    // Exercise days this week
    if (new Date(m.recorded_at) >= weekStart && m.exercises_done && m.exercises_done.length > 0) {
      const day = new Date(m.recorded_at).toISOString().slice(0, 10)
      if (!exerciseDaysMap.has(m.patient_id)) exerciseDaysMap.set(m.patient_id, new Set())
      exerciseDaysMap.get(m.patient_id)!.add(day)
    }
  }

  // Compute proper 7-day averages
  const painSums = new Map<string, { sum: number; count: number }>()
  for (const m of metrics ?? []) {
    if (new Date(m.recorded_at) >= sevenDaysAgo && m.pain_level != null) {
      const entry = painSums.get(m.patient_id) ?? { sum: 0, count: 0 }
      entry.sum += m.pain_level
      entry.count += 1
      painSums.set(m.patient_id, entry)
    }
  }
  for (const [pid, { sum, count }] of painSums) {
    avgPain7dMap.set(pid, sum / count)
  }

  return patients.map((p) => {
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

    // Active if messaged within last 3 days and no other status
    if (status === 'active' && daysSinceMsg != null && daysSinceMsg > 3) {
      // Not truly active by our definition, but not inactive/alert/new either
      // Keep as active (default)
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
}

function getWeekStart(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) // Monday
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

export default async function PatientsPage() {
  const patients = await getPatients()
  return <PatientList patients={patients} />
}
