import { describe, it, expect } from 'vitest'

// Pure helper logic mirroring the implementations in PatientsClient.tsx.
// No React / browser deps — matches the pattern from review-requests/__tests__/table.test.ts.

interface PatientRow {
  id: string
  name: string
  phone: string | null
  email: string | null
  last_visit: string | null
  session_count: number
}

function filterPatients(patients: PatientRow[], query: string): PatientRow[] {
  const q = query.trim().toLowerCase()
  if (!q) return patients
  return patients.filter((p) => p.name.toLowerCase().includes(q))
}

function formatLastVisit(last_visit: string | null): string {
  if (!last_visit) return 'No sessions yet'
  // Slice the date part directly — avoids timezone shifting when parsing ISO date-only strings
  return last_visit.slice(0, 10)
}

describe('filterPatients', () => {
  const patients: PatientRow[] = [
    {
      id: 'p1',
      name: 'Jason Gao',
      phone: null,
      email: 'jasonusca@gmail.com',
      last_visit: '2026-05-20',
      session_count: 3,
    },
    {
      id: 'p2',
      name: 'Ethan Liu',
      phone: '+14035550123',
      email: null,
      last_visit: null,
      session_count: 0,
    },
  ]

  it('returns all patients when query is empty', () => {
    expect(filterPatients(patients, '')).toHaveLength(2)
  })

  it('returns all patients when query is only whitespace', () => {
    expect(filterPatients(patients, '   ')).toHaveLength(2)
  })

  it('filters by name case-insensitively', () => {
    const result = filterPatients(patients, 'jason')
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Jason Gao')
  })

  it('returns empty array when no name matches', () => {
    expect(filterPatients(patients, 'xyz')).toHaveLength(0)
  })

  it('matches partial name', () => {
    const result = filterPatients(patients, 'liu')
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Ethan Liu')
  })
})

describe('formatLastVisit', () => {
  it('returns "No sessions yet" when last_visit is null', () => {
    expect(formatLastVisit(null)).toBe('No sessions yet')
  })

  it('formats a valid ISO date string', () => {
    expect(formatLastVisit('2026-05-20')).toBe('2026-05-20')
  })
})

describe('patient table shape', () => {
  it('mock patients have correct structure for both test users', () => {
    const jason: PatientRow = {
      id: 'uuid-1',
      name: 'Jason Gao',
      phone: null,
      email: 'jasonusca@gmail.com',
      last_visit: null,
      session_count: 0,
    }
    const ethan: PatientRow = {
      id: 'uuid-2',
      name: 'Ethan Liu',
      phone: '+14035550123',
      email: null,
      last_visit: null,
      session_count: 0,
    }
    // Both should pass filter with their names
    expect(filterPatients([jason, ethan], 'gao')).toHaveLength(1)
    expect(filterPatients([jason, ethan], 'ethan')).toHaveLength(1)
    // Both show "No sessions yet" since no intake records linked yet
    expect(formatLastVisit(jason.last_visit)).toBe('No sessions yet')
    expect(formatLastVisit(ethan.last_visit)).toBe('No sessions yet')
  })
})
