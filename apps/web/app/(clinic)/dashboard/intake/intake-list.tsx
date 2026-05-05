'use client'

import Link from 'next/link'
import type { IntakeRecord } from '@physio-os/shared'
import { Card, CardContent } from '@/components/ui/card'
import { ClipboardList } from 'lucide-react'

function formatDate(dateStr: string): string {
  // date_of_visit is YYYY-MM-DD; render as local-friendly without TZ surprises
  const [y, m, d] = dateStr.split('-')
  if (!y || !m || !d) return dateStr
  return `${y}-${m}-${d}`
}

function notesPreview(notes: string, max = 80): string {
  const trimmed = notes.trim().replace(/\s+/g, ' ')
  if (trimmed.length <= max) return trimmed
  return trimmed.slice(0, max - 1) + '…'
}

export function IntakeList({ records }: { records: IntakeRecord[] }) {
  if (records.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <ClipboardList className="h-10 w-10 text-muted-foreground" />
          <div>
            <p className="text-base font-medium">No intake records yet</p>
            <p className="text-sm text-muted-foreground">
              Use the staff intake page to create the first one.
            </p>
          </div>
          <a
            href="/staff/intake"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            + New Record
          </a>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Date</th>
                <th scope="col" className="px-4 py-3 font-medium">Patient</th>
                <th scope="col" className="px-4 py-3 font-medium">Therapist</th>
                <th scope="col" className="px-4 py-3 font-medium">Treatment Area</th>
                <th scope="col" className="px-4 py-3 font-medium">Notes Preview</th>
                <th scope="col" className="px-4 py-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r, i) => (
                <tr
                  key={r.id}
                  className={
                    i % 2 === 0
                      ? 'border-b bg-background hover:bg-muted/30'
                      : 'border-b bg-muted/20 hover:bg-muted/40'
                  }
                >
                  <td className="px-4 py-3 whitespace-nowrap">{formatDate(r.date_of_visit)}</td>
                  <td className="px-4 py-3 font-medium">{r.patient_name}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{r.therapist_name}</td>
                  <td className="px-4 py-3">{r.treatment_area}</td>
                  <td className="px-4 py-3 text-muted-foreground">{notesPreview(r.session_notes)}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <Link
                      href={`/dashboard/intake/${r.id}`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
