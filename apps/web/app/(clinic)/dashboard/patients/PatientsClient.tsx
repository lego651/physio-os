'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export interface PatientRow {
  id: string
  name: string
  phone: string | null
  email: string | null
  last_visit: string | null
  session_count: number
}

function formatLastVisit(last_visit: string | null): string {
  if (!last_visit) return 'No sessions yet'
  return last_visit.slice(0, 10)
}

export default function PatientsClient({ patients }: { patients: PatientRow[] }) {
  const [query, setQuery] = useState('')

  const filtered = query.trim()
    ? patients.filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase()))
    : patients

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Patients</h1>
        <Button disabled variant="outline" size="sm">
          Add patient (via Voice Intake)
        </Button>
      </div>

      <Input
        placeholder="Search patients..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="max-w-sm"
      />

      {patients.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No patients yet. Complete a voice intake to add the first patient.
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No patients match &ldquo;{query}&rdquo;.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Last Visit</TableHead>
              <TableHead>Sessions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((patient) => (
              <TableRow key={patient.id}>
                <TableCell>
                  {/* detail page (S1.7-8) not built yet — link is disabled */}
                  <Link href="#" className="font-medium hover:underline text-primary">
                    {patient.name}
                  </Link>
                </TableCell>
                <TableCell>{patient.phone ?? '—'}</TableCell>
                <TableCell>{patient.email ?? '—'}</TableCell>
                <TableCell>{formatLastVisit(patient.last_visit)}</TableCell>
                <TableCell>{patient.session_count}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
