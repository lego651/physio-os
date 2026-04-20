// apps/web/app/(clinic)/dashboard/widget/charts.tsx
'use client'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import type { SimMetrics } from '@/lib/widget/seed-metrics'

export function WidgetDashboardCharts({ metrics }: { metrics: SimMetrics }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="rounded border p-3">
        <div className="font-semibold mb-2">Therapist recommendations</div>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={metrics.therapistDistribution}>
            <XAxis dataKey="name" interval={0} angle={-25} textAnchor="end" height={80} fontSize={10} />
            <YAxis />
            <Tooltip />
            <Bar dataKey="recommendations" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="rounded border p-3">
        <div className="font-semibold mb-2">Conversations & leads (30 days)</div>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={metrics.dailySeries}>
            <XAxis dataKey="date" fontSize={10} />
            <YAxis />
            <Tooltip />
            <Line type="monotone" dataKey="conversations" stroke="#2563eb" />
            <Line type="monotone" dataKey="leads" stroke="#16a34a" />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="rounded border p-3 col-span-2">
        <div className="font-semibold mb-2">Top questions asked</div>
        <ol className="list-decimal ml-6">
          {metrics.topQuestions.map((q) => (
            <li key={q.q} className="py-1">
              {q.q} <span className="text-gray-500 text-sm">— {q.count}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
