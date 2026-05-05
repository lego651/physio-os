'use client'

import Link from 'next/link'
import type { IntakeRecord } from '@physio-os/shared'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Printer } from 'lucide-react'

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-')
  if (!y || !m || !d) return dateStr
  return `${y}-${m}-${d}`
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

export function IntakeDetail({ record }: { record: IntakeRecord }) {
  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print()
    }
  }

  return (
    <div className="space-y-6">
      {/* Top bar — hidden on print */}
      <div className="flex items-center justify-between print:hidden">
        <Button variant="ghost" size="sm" render={<Link href="/dashboard/intake" />}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back
        </Button>
        <Button onClick={handlePrint} size="sm">
          <Printer className="mr-1 h-4 w-4" />
          Print / Download PDF
        </Button>
      </div>

      {/* Print-only header */}
      <div className="hidden print:block">
        <h1 className="text-2xl font-bold">V-Health Rehab Clinic</h1>
        <p className="text-sm text-muted-foreground">Intake Record</p>
        <hr className="my-3" />
      </div>

      {/* Main record card */}
      <Card className="print:border-0 print:shadow-none">
        <CardHeader>
          <CardTitle className="text-xl">
            {record.patient_name}
            <span className="ml-3 text-sm font-normal text-muted-foreground">
              {formatDate(record.date_of_visit)}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Patient</p>
              <p className="text-base font-medium">{record.patient_name}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Date of Visit</p>
              <p className="text-base font-medium">{formatDate(record.date_of_visit)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Therapist</p>
              <p className="text-base font-medium">{record.therapist_name}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Treatment Area</p>
              <p className="text-base font-medium">{record.treatment_area}</p>
            </div>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Session Notes</p>
            <p className="mt-1 whitespace-pre-wrap text-base leading-relaxed">{record.session_notes}</p>
          </div>

          {record.raw_transcript && (
            <details className="print:hidden">
              <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
                Show raw transcript
              </summary>
              <pre className="mt-2 whitespace-pre-wrap rounded-md bg-muted p-3 text-xs text-muted-foreground">
                {record.raw_transcript}
              </pre>
            </details>
          )}

          {/* Print-only raw transcript section (always visible on paper) */}
          {record.raw_transcript && (
            <div className="hidden print:block">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Raw Transcript</p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{record.raw_transcript}</p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 border-t pt-4 text-xs text-muted-foreground sm:grid-cols-3 print:hidden">
            <div>
              <p className="uppercase tracking-wide">Source</p>
              <p>{record.source}</p>
            </div>
            <div>
              <p className="uppercase tracking-wide">Created</p>
              <p>{formatTimestamp(record.created_at)}</p>
            </div>
            <div>
              <p className="uppercase tracking-wide">Updated</p>
              <p>{formatTimestamp(record.updated_at)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Print-only footer */}
      <div className="hidden print:block">
        <hr className="my-3" />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Record ID: {record.id}</span>
          <span>Generated: {new Date().toLocaleString()}</span>
        </div>
      </div>
    </div>
  )
}
