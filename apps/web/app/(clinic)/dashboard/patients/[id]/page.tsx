import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Globe, User, Calendar, Stethoscope } from 'lucide-react'
import { MetricOverviewCards } from './metric-overview-cards'
import { TrendChart } from './trend-chart'
import { MetricsTable } from './metrics-table'

export const dynamic = 'force-dynamic'

interface PatientDetail {
  id: string
  name: string | null
  phone: string
  language: string
  active: boolean
  opted_out: boolean
  created_at: string
  practitioner_name: string | null
  profile: Record<string, unknown> | null
}

export interface MetricRow {
  id: string
  recorded_at: string
  pain_level: number | null
  discomfort: number | null
  sitting_tolerance_min: number | null
  exercises_done: string[] | null
  exercise_count: number | null
  notes: string | null
}

async function getPatientDetail(id: string) {
  const supabase = createAdminClient()

  const { data: patient, error } = await supabase
    .from('patients')
    .select('id, name, phone, language, active, opted_out, created_at, practitioner_name, profile')
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  if (!patient) return null

  const { data: metrics } = await supabase
    .from('metrics')
    .select('id, recorded_at, pain_level, discomfort, sitting_tolerance_min, exercises_done, exercise_count, notes')
    .eq('patient_id', id)
    .order('recorded_at', { ascending: false })

  return {
    patient: patient as PatientDetail,
    metrics: (metrics ?? []) as MetricRow[],
  }
}

export default async function PatientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const data = await getPatientDetail(id)
  if (!data) notFound()

  const { patient, metrics } = data
  const profile = patient.profile as Record<string, string> | null

  return (
    <div className="space-y-6">
      {/* Back button */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" render={<Link href="/dashboard/patients" />}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back
        </Button>
      </div>

      {/* Profile card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            {patient.name ?? 'Unnamed Patient'}
            <Badge variant="outline" className="text-xs">
              {patient.language === 'zh' ? 'CN' : 'EN'}
            </Badge>
            {patient.active ? (
              <Badge className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">Active</Badge>
            ) : (
              <Badge className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">Inactive</Badge>
            )}
            {patient.opted_out && (
              <Badge variant="destructive">Opted out</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Language</p>
                <p>{patient.language === 'zh' ? 'Chinese' : 'English'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Enrolled</p>
                <p>{new Date(patient.created_at).toLocaleDateString()}</p>
              </div>
            </div>
            {patient.practitioner_name && (
              <div className="flex items-center gap-2">
                <Stethoscope className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Practitioner</p>
                  <p>{patient.practitioner_name}</p>
                </div>
              </div>
            )}
            {profile?.diagnosis && (
              <div>
                <p className="text-xs text-muted-foreground">Condition</p>
                <p>{profile.diagnosis}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Metric overview cards */}
      <MetricOverviewCards metrics={metrics} />

      {/* Trend chart */}
      <TrendChart metrics={metrics} />

      {/* Metrics table */}
      <MetricsTable metrics={metrics} />
    </div>
  )
}
