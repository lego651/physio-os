'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Users, Search, ArrowUpDown, AlertTriangle, Clock, TrendingDown, TrendingUp, Activity, MessageSquare } from 'lucide-react'
import type { PatientWithAggregates } from './page'

type SortKey = 'activity' | 'name' | 'status'

const STATUS_ORDER: Record<PatientWithAggregates['status'], number> = {
  alert: 0,
  inactive: 1,
  new: 2,
  active: 3,
}

export function PatientList({ patients }: { patients: PatientWithAggregates[] }) {
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<SortKey>('activity')

  const alertCount = patients.filter((p) => p.status === 'alert').length
  const inactiveCount = patients.filter((p) => {
    const days = p.days_since_last_message ?? Math.floor((Date.now() - new Date(p.created_at).getTime()) / 86400000)
    return days >= 5
  }).length

  const filtered = useMemo(() => {
    let result = patients
    if (search) {
      const q = search.toLowerCase()
      result = result.filter((p) => p.name?.toLowerCase().includes(q) || p.phone.includes(q))
    }
    result = [...result].sort((a, b) => {
      if (sortBy === 'activity') {
        const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0
        const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0
        return bTime - aTime
      }
      if (sortBy === 'name') {
        return (a.name ?? '').localeCompare(b.name ?? '')
      }
      // status sort: alert first, then inactive, new, active
      return STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
    })
    return result
  }, [patients, search, sortBy])

  if (patients.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Patients</h1>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Users className="mb-4 h-12 w-12" />
            <p className="text-lg font-medium">No patients enrolled yet</p>
            <p className="text-sm">Add a patient to get started.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Patients</h1>

      {/* Alert / Inactive summaries */}
      {(alertCount > 0 || inactiveCount > 0) && (
        <div className="flex flex-wrap gap-3">
          {alertCount > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
              <AlertTriangle className="h-4 w-4" />
              {alertCount} patient{alertCount > 1 ? 's' : ''} with pain spike
            </div>
          )}
          {inactiveCount > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-400">
              <Clock className="h-4 w-4" />
              {inactiveCount} patient{inactiveCount > 1 ? 's' : ''} inactive for 5+ days
            </div>
          )}
        </div>
      )}

      {/* Search + Sort controls */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search patients..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-1">
          {(['activity', 'name', 'status'] as const).map((key) => (
            <Button
              key={key}
              variant={sortBy === key ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setSortBy(key)}
            >
              <ArrowUpDown className="mr-1 h-3 w-3" />
              {key === 'activity' ? 'Recent' : key === 'name' ? 'A-Z' : 'Status'}
            </Button>
          ))}
        </div>
      </div>

      {/* Patient cards */}
      <div className="grid gap-3">
        {filtered.map((patient) => (
          <PatientCard key={patient.id} patient={patient} />
        ))}
      </div>

      {filtered.length === 0 && search && (
        <p className="py-8 text-center text-muted-foreground">No patients match &ldquo;{search}&rdquo;</p>
      )}
    </div>
  )
}

function PatientCard({ patient }: { patient: PatientWithAggregates }) {
  return (
    <Link href={`/dashboard/patients/${patient.id}`}>
      <Card className="cursor-pointer transition-colors hover:bg-muted/50">
        <CardContent className="py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {/* Left: Name + badges */}
            <div className="flex items-center gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{patient.name ?? 'Unnamed'}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {patient.language === 'zh' ? 'CN' : 'EN'}
                  </Badge>
                  <StatusBadge status={patient.status} daysSinceMessage={patient.days_since_last_message} createdAt={patient.created_at} />
                </div>
                {patient.alert_detail && (
                  <p className="mt-0.5 text-xs text-red-600 dark:text-red-400">{patient.alert_detail}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  {patient.last_message_at ? relativeTime(patient.last_message_at) : 'No activity yet'}
                </p>
              </div>
            </div>

            {/* Right: Metrics */}
            <div className="flex items-center gap-4 text-sm">
              <MetricPill
                icon={<Activity className="h-3.5 w-3.5" />}
                label="Pain"
                value={patient.latest_pain}
                color={painColor(patient.latest_pain)}
              />
              <MetricPill
                icon={<TrendingDown className="h-3.5 w-3.5" />}
                label="Discomfort"
                value={patient.latest_discomfort}
                color={discomfortColor(patient.latest_discomfort)}
              />
              <div className="flex items-center gap-1 text-muted-foreground">
                <MessageSquare className="h-3.5 w-3.5" />
                <span className="font-mono text-xs">{patient.exercise_days_this_week}/7</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

function StatusBadge({
  status,
  daysSinceMessage,
  createdAt,
}: {
  status: PatientWithAggregates['status']
  daysSinceMessage: number | null
  createdAt: string
}) {
  const inactiveDays = daysSinceMessage ?? Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000)

  switch (status) {
    case 'alert':
      return <Badge className="bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300">Alert</Badge>
    case 'inactive':
      return (
        <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300">
          Inactive — {inactiveDays >= 30 ? '30+' : inactiveDays} days
        </Badge>
      )
    case 'new':
      return <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">New</Badge>
    case 'active':
      return <Badge className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">Active</Badge>
    default:
      return null
  }
}

function MetricPill({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode
  label: string
  value: number | null
  color: string
}) {
  return (
    <div className="flex items-center gap-1" title={label}>
      <span className={color}>{icon}</span>
      <span className={`font-mono text-xs ${color}`}>{value ?? '—'}</span>
    </div>
  )
}

function painColor(v: number | null): string {
  if (v == null) return 'text-muted-foreground'
  if (v <= 3) return 'text-green-600 dark:text-green-400'
  if (v <= 6) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

function discomfortColor(v: number | null): string {
  if (v == null) return 'text-muted-foreground'
  if (v <= 1) return 'text-green-600 dark:text-green-400'
  if (v === 2) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

function relativeTime(dateStr: string): string {
  const now = Date.now()
  const date = new Date(dateStr).getTime()
  const diff = now - date
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}
