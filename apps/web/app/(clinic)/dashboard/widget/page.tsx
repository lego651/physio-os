// apps/web/app/(clinic)/dashboard/widget/page.tsx
import { createAdminClient } from '@/lib/supabase/admin'
import { loadClinicKB } from '@/lib/widget/knowledge-base'
import { generateSimMetrics } from '@/lib/widget/seed-metrics'
import { WidgetDashboardCharts } from './charts'

export default async function WidgetDashboard() {
  const kb = await loadClinicKB(createAdminClient(), 'vhealth')
  const metrics = generateSimMetrics((kb?.therapists ?? []).map((t) => t.name))
  return (
    <div className="p-6 space-y-4">
      <div className="rounded-md bg-amber-100 border border-amber-300 px-4 py-3 text-amber-900 text-sm">
        <strong>Simulated data.</strong> These numbers are projections based on industry benchmarks for clinics of this size. Real usage replaces these on Day 1 of the pilot.
      </div>
      <h1 className="text-2xl font-semibold">Chatbot — last 30 days (projected)</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card title="Conversations" value={metrics.conversations.toString()} />
        <Card title="Leads captured" value={metrics.leads.toString()} />
        <Card title="Reviews generated" value={metrics.reviewsGenerated.toString()} />
        <Card title="Front-desk time saved" value={`${metrics.hoursSaved} hrs`} />
      </div>
      <WidgetDashboardCharts metrics={metrics} />
    </div>
  )
}

function Card({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded border p-3">
      <div className="text-xs text-gray-600">{title}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  )
}
