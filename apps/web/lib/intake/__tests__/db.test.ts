import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock createAdminClient — we test logic, not the Supabase wire
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}))

import { createAdminClient } from '@/lib/supabase/admin'
import type { SaveIntakeRecordInput } from '../db'

/**
 * Minimal chainable Supabase mock for saveIntakeRecord tests.
 *
 * Tables:
 *   patients        — returns patientRow (with name field)
 *   intake_records  — captures INSERT payload, returns a stub row
 */
function makeSupabaseForSave(opts: {
  patientRow?: { name: string; phone: string | null; email: string | null } | null
}) {
  const { patientRow = null } = opts

  let capturedInsert: Record<string, unknown> | null = null

  const fromImpl = (table: string) => {
    if (table === 'patients') {
      return {
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: patientRow, error: null }),
          }),
        }),
      }
    }

    if (table === 'intake_records') {
      return {
        insert: (payload: Record<string, unknown>) => {
          capturedInsert = payload
          return {
            select: () => ({
              single: () =>
                Promise.resolve({
                  data: { id: 'ir-uuid', ...payload },
                  error: null,
                }),
            }),
          }
        },
      }
    }

    throw new Error(`Unexpected table in mock: ${table}`)
  }

  return {
    client: { from: fromImpl } as unknown as ReturnType<typeof createAdminClient>,
    getInsert: () => capturedInsert,
  }
}

// ─── Bug U: saveIntakeRecord canonical patient_name ───────────────────────────
//
// When patient_id is provided, saveIntakeRecord must store patients.name
// in intake_records.patient_name — NOT the Whisper transcript name.

describe('saveIntakeRecord — Bug U: canonical patient_name from patients table', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('overrides transcript patient_name with patients.name when patient_id is provided', async () => {
    const { client, getInsert } = makeSupabaseForSave({
      patientRow: { name: 'Ethan Liu', phone: '+12368682134', email: null },
    })
    vi.mocked(createAdminClient).mockReturnValue(client)

    const { saveIntakeRecord } = await import('../db')
    const input: SaveIntakeRecordInput = {
      patient_name: 'Easton Leo', // Whisper mis-transcription
      treatment_area: 'shoulder',
      session_type: 'physio',
      therapist_name: 'David',
      session_notes: 'test notes',
      date_of_visit: '2026-05-23',
      source: 'in_app',
      patient_id: 'patient-ethan',
    }
    await saveIntakeRecord(input)

    const inserted = getInsert() as Record<string, unknown>
    // Must be canonical name from patients table
    expect(inserted.patient_name).toBe('Ethan Liu')
  })

  it('uses input.patient_name as-is when no patient_id is provided (unlinked visit)', async () => {
    const { client, getInsert } = makeSupabaseForSave({ patientRow: null })
    vi.mocked(createAdminClient).mockReturnValue(client)

    const { saveIntakeRecord } = await import('../db')
    const input: SaveIntakeRecordInput = {
      patient_name: 'Walk-In Smith',
      treatment_area: 'knee',
      session_type: 'physio',
      therapist_name: 'David',
      session_notes: '',
      date_of_visit: '2026-05-23',
      source: 'in_app',
      // patient_id omitted
    }
    await saveIntakeRecord(input)

    const inserted = getInsert() as Record<string, unknown>
    expect(inserted.patient_name).toBe('Walk-In Smith')
  })
})
