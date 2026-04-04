'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'

export interface DailyDiscomfortPoint {
  day: string
  discomfort: number | null
}

interface DiscomfortChartProps {
  data: DailyDiscomfortPoint[]
}

export function DiscomfortChart({ data }: DiscomfortChartProps) {
  const hasData = data.some((d) => d.discomfort !== null)
  if (!hasData) return null

  return (
    <ResponsiveContainer width="100%" height={160}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          dataKey="day"
          tick={{ fontSize: 12, fill: '#6b7280' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          domain={[0, 3]}
          ticks={[0, 1, 2, 3]}
          tick={{ fontSize: 12, fill: '#6b7280' }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={{
            borderRadius: '8px',
            border: '1px solid #e5e7eb',
            fontSize: 12,
          }}
          formatter={(value) => [typeof value === 'number' ? value.toFixed(1) : value, 'Discomfort']}
        />
        <Line
          type="monotone"
          dataKey="discomfort"
          stroke="#F59E0B"
          strokeWidth={2}
          dot={{ r: 3, fill: '#F59E0B', strokeWidth: 0 }}
          activeDot={{ r: 5 }}
          connectNulls={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
