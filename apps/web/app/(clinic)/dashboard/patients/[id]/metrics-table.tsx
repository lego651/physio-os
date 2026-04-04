'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ClipboardList } from 'lucide-react'
import type { MetricRow } from './page'

const PAGE_SIZE = 20

export function MetricsTable({ metrics }: { metrics: MetricRow[] }) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  const visible = metrics.slice(0, visibleCount)
  const hasMore = visibleCount < metrics.length

  if (metrics.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="h-4 w-4" />
            Metrics History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="py-8 text-center text-muted-foreground">No metrics recorded yet</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardList className="h-4 w-4" />
          Metrics History
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Pain</TableHead>
                <TableHead>Discomfort</TableHead>
                <TableHead>Sitting (min)</TableHead>
                <TableHead>Exercises</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="whitespace-nowrap text-xs">
                    {new Date(m.recorded_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </TableCell>
                  <TableCell>
                    <PainCell value={m.pain_level} />
                  </TableCell>
                  <TableCell>
                    <DiscomfortCell value={m.discomfort} />
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {m.sitting_tolerance_min ?? '—'}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate text-xs" title={m.exercises_done?.join(', ')}>
                    {m.exercises_done && m.exercises_done.length > 0
                      ? m.exercises_done.join(', ')
                      : '—'}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                    {m.notes ?? '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {hasMore && (
          <div className="mt-4 flex justify-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
            >
              Load more ({metrics.length - visibleCount} remaining)
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function PainCell({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted-foreground">—</span>
  const color = value <= 3 ? 'text-green-600' : value <= 6 ? 'text-amber-600' : 'text-red-600'
  return <span className={`font-mono font-medium ${color}`}>{value}</span>
}

function DiscomfortCell({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted-foreground">—</span>
  const color = value <= 1 ? 'text-green-600' : value === 2 ? 'text-amber-600' : 'text-red-600'
  return <span className={`font-mono font-medium ${color}`}>{value}</span>
}
