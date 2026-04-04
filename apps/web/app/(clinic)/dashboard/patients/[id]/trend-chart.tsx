'use client'

import { useState, useMemo } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { TrendingUp } from 'lucide-react'
import type { MetricRow } from './page'

type Range = '7d' | '14d' | '30d' | 'all'

const RANGES: { key: Range; label: string }[] = [
  { key: '7d', label: '7 days' },
  { key: '14d', label: '14 days' },
  { key: '30d', label: '30 days' },
  { key: 'all', label: 'All time' },
]

export function TrendChart({ metrics }: { metrics: MetricRow[] }) {
  const [range, setRange] = useState<Range>('30d')
  const [now] = useState(() => Date.now())

  const chartData = useMemo(() => {
    const rangeMs: Record<Range, number> = {
      '7d': 7 * 86400000,
      '14d': 14 * 86400000,
      '30d': 30 * 86400000,
      all: Infinity,
    }

    const cutoff = rangeMs[range] === Infinity ? 0 : now - rangeMs[range]

    return metrics
      .filter((m) => new Date(m.recorded_at).getTime() >= cutoff)
      .map((m) => ({
        date: new Date(m.recorded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        rawDate: new Date(m.recorded_at).getTime(),
        pain: m.pain_level,
        discomfort: m.discomfort,
      }))
      .sort((a, b) => a.rawDate - b.rawDate)
  }, [metrics, range, now])

  if (metrics.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4" />
            Pain & Discomfort Trend
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="py-8 text-center text-muted-foreground">
            Waiting for first check-in
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4" />
            Pain & Discomfort Trend
          </CardTitle>
          <div className="flex gap-1">
            {RANGES.map((r) => (
              <Button
                key={r.key}
                variant={range === r.key ? 'default' : 'ghost'}
                size="sm"
                className="min-h-[44px] min-w-[44px]"
                onClick={() => setRange(r.key)}
                aria-label={`Show ${r.label} range`}
              >
                {r.label}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12 }}
                className="fill-muted-foreground"
              />
              <YAxis
                yAxisId="discomfort"
                orientation="left"
                domain={[0, 3]}
                tick={{ fontSize: 12 }}
                className="fill-muted-foreground"
                label={{ value: 'Discomfort', angle: -90, position: 'insideLeft', style: { fontSize: 11 } }}
              />
              <YAxis
                yAxisId="pain"
                orientation="right"
                domain={[0, 10]}
                tick={{ fontSize: 12 }}
                className="fill-muted-foreground"
                label={{ value: 'Pain', angle: 90, position: 'insideRight', style: { fontSize: 11 } }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
              />
              <Legend />
              <Line
                yAxisId="discomfort"
                type="monotone"
                dataKey="discomfort"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={chartData.length === 1}
                name="Discomfort (0-3)"
                connectNulls
              />
              <Line
                yAxisId="pain"
                type="monotone"
                dataKey="pain"
                stroke="#ef4444"
                strokeWidth={2}
                dot={chartData.length === 1}
                name="Pain (0-10)"
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
