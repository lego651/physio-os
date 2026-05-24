import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock createAdminClient — we test the logic, not the Supabase wire
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}))

import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Build a minimal chainable Supabase mock.
 *
 * Tables supported:
 *   clinics  — returns `{ id: 'clinic-uuid' }` by default
 *   patients — returns the row passed via `patientRow`
 *   review_requests — captures INSERT payload, returns `{ id: 'rr-uuid' }`
 */
function makeSupabase(opts: {
  patientRow?: { phone: string | null; email: string | null } | null
  patientsError?: string
}) {
  const { patientRow = null, patientsError } = opts

  // Track what was inserted into review_requests
  let capturedInsert: Record<string, unknown> | null = null

  const fromImpl = (table: string) => {
    if (table === 'clinics') {
      return {
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: { id: 'clinic-uuid' }, error: null }),
          }),
        }),
      }
    }

    if (table === 'patients') {
      if (patientsError) {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: null, error: { message: patientsError } }),
            }),
          }),
        }
      }
      return {
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: patientRow, error: null }),
          }),
        }),
      }
    }

    if (table === 'review_requests') {
      return {
        insert: (payload: Record<string, unknown>) => {
          capturedInsert = payload
          return {
            select: () => ({
              single: () => Promise.resolve({ data: { id: 'rr-uuid' }, error: null }),
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

describe('createReviewRequestForIntake — S1.7-6 contact auto-fill', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('writes phone and email from patients table when patient_id is provided', async () => {
    const { client, getInsert } = makeSupabase({
      patientRow: { phone: '+14031234567', email: 'jason@gmail.com' },
    })
    vi.mocked(createAdminClient).mockReturnValue(client)

    const { createReviewRequestForIntake } = await import('../db')
    await createReviewRequestForIntake({
      intake_record_id: 'intake-uuid',
      patient_name: 'Jason Gao',
      therapist_name: 'David',
      service_type: 'physio',
      patient_id: 'patient-uuid',
    })

    const inserted = getInsert() as Record<string, unknown>
    expect(inserted.patient_phone).toBe('+14031234567')
    expect(inserted.patient_email).toBe('jason@gmail.com')
    expect(inserted.patient_id).toBe('patient-uuid')
  })

  it('leaves phone and email NULL when patient_id is not provided (backward-compat)', async () => {
    const { client, getInsert } = makeSupabase({ patientRow: null })
    vi.mocked(createAdminClient).mockReturnValue(client)

    const { createReviewRequestForIntake } = await import('../db')
    await createReviewRequestForIntake({
      intake_record_id: 'intake-uuid',
      patient_name: 'Walk-In Patient',
      therapist_name: 'David',
      service_type: 'massage',
      // patient_id intentionally omitted
    })

    const inserted = getInsert() as Record<string, unknown>
    expect(inserted.patient_phone).toBeNull()
    expect(inserted.patient_email).toBeNull()
    expect(inserted.patient_id).toBeUndefined()
  })

  it('fills phone only, leaves email NULL when patient has phone but no email', async () => {
    const { client, getInsert } = makeSupabase({
      patientRow: { phone: '+14039876543', email: null },
    })
    vi.mocked(createAdminClient).mockReturnValue(client)

    const { createReviewRequestForIntake } = await import('../db')
    await createReviewRequestForIntake({
      intake_record_id: 'intake-uuid',
      patient_name: 'Ethan Liu',
      therapist_name: 'David',
      service_type: 'acupuncture',
      patient_id: 'patient-ethan',
    })

    const inserted = getInsert() as Record<string, unknown>
    expect(inserted.patient_phone).toBe('+14039876543')
    expect(inserted.patient_email).toBeNull()
  })

  it('fills email only, leaves phone NULL when patient has email but no phone', async () => {
    const { client, getInsert } = makeSupabase({
      patientRow: { phone: null, email: 'email-only@example.com' },
    })
    vi.mocked(createAdminClient).mockReturnValue(client)

    const { createReviewRequestForIntake } = await import('../db')
    await createReviewRequestForIntake({
      intake_record_id: 'intake-uuid',
      patient_name: 'Email Only Patient',
      therapist_name: 'Sarah',
      service_type: 'physio',
      patient_id: 'patient-email-only',
    })

    const inserted = getInsert() as Record<string, unknown>
    expect(inserted.patient_phone).toBeNull()
    expect(inserted.patient_email).toBe('email-only@example.com')
  })

  it('falls back to NULL contact when patient_id points to non-existent patient (graceful degradation)', async () => {
    const { client, getInsert } = makeSupabase({
      patientRow: null,
      patientsError: 'Row not found',
    })
    vi.mocked(createAdminClient).mockReturnValue(client)

    const { createReviewRequestForIntake } = await import('../db')
    // Should NOT throw — intake save must not be blocked by patient lookup failure
    await expect(
      createReviewRequestForIntake({
        intake_record_id: 'intake-uuid',
        patient_name: 'Ghost Patient',
        therapist_name: 'David',
        service_type: 'physio',
        patient_id: 'non-existent-uuid',
      }),
    ).resolves.toBeTypeOf('string')

    const inserted = getInsert() as Record<string, unknown>
    expect(inserted.patient_phone).toBeNull()
    expect(inserted.patient_email).toBeNull()
  })
})
