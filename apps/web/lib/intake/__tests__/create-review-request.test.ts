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
 *   intake_records  — captures INSERT payload, returns `{ id: 'ir-uuid' }`
 */
function makeSupabase(opts: {
  patientRow?: { name?: string; phone: string | null; email: string | null } | null
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

  it('always inserts row with channel=email and status=pending when no contact info (Bug V)', async () => {
    const { client, getInsert } = makeSupabase({ patientRow: null })
    vi.mocked(createAdminClient).mockReturnValue(client)

    const { createReviewRequestForIntake } = await import('../db')
    const result = await createReviewRequestForIntake({
      intake_record_id: 'intake-uuid',
      patient_name: 'Walk-In Patient',
      therapist_name: 'David',
      service_type: 'massage',
      // patient_id intentionally omitted — no contact info available
    })

    // Bug V: must always INSERT so admin sees pending row in dashboard
    expect(result).toBe('rr-uuid')
    const inserted = getInsert() as Record<string, unknown>
    expect(inserted.channel).toBe('email')
    expect(inserted.status).toBe('pending')
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

  it('inserts pending row when patient_id points to non-existent patient (graceful degradation, Bug V)', async () => {
    const { client, getInsert } = makeSupabase({
      patientRow: null,
      patientsError: 'Row not found',
    })
    vi.mocked(createAdminClient).mockReturnValue(client)

    const { createReviewRequestForIntake } = await import('../db')
    // Should NOT throw — intake save must not be blocked by patient lookup failure.
    // Bug V: even when lookup fails, INSERT row so admin sees it in dashboard.
    const result = await createReviewRequestForIntake({
      intake_record_id: 'intake-uuid',
      patient_name: 'Ghost Patient',
      therapist_name: 'David',
      service_type: 'physio',
      patient_id: 'non-existent-uuid',
    })

    expect(result).toBe('rr-uuid')
    const inserted = getInsert() as Record<string, unknown>
    expect(inserted.channel).toBe('email')
    expect(inserted.status).toBe('pending')
    expect(inserted.patient_phone).toBeNull()
    expect(inserted.patient_email).toBeNull()
  })
})

describe('createReviewRequestForIntake — channel auto-pick (Bug T)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sets channel=email when patient has both email and phone (email preferred)', async () => {
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
    expect(inserted.channel).toBe('email')
  })

  it('sets channel=email when patient has email only (no phone)', async () => {
    const { client, getInsert } = makeSupabase({
      patientRow: { phone: null, email: 'email-only@example.com' },
    })
    vi.mocked(createAdminClient).mockReturnValue(client)

    const { createReviewRequestForIntake } = await import('../db')
    await createReviewRequestForIntake({
      intake_record_id: 'intake-uuid',
      patient_name: 'Email Only',
      therapist_name: 'David',
      service_type: 'physio',
      patient_id: 'patient-email-only',
    })

    const inserted = getInsert() as Record<string, unknown>
    expect(inserted.channel).toBe('email')
  })

  it('sets channel=sms when patient has phone only (no email) — Ethan Liu case', async () => {
    const { client, getInsert } = makeSupabase({
      patientRow: { phone: '+12368682134', email: null },
    })
    vi.mocked(createAdminClient).mockReturnValue(client)

    const { createReviewRequestForIntake } = await import('../db')
    await createReviewRequestForIntake({
      intake_record_id: 'intake-uuid',
      patient_name: 'Ethan Liu',
      therapist_name: 'David',
      service_type: 'physio',
      patient_id: 'patient-ethan',
    })

    const inserted = getInsert() as Record<string, unknown>
    expect(inserted.channel).toBe('sms')
  })

  it('inserts row with channel=email and status=pending when patient has neither email nor phone (Bug V)', async () => {
    const { client, getInsert } = makeSupabase({
      patientRow: { phone: null, email: null },
    })
    vi.mocked(createAdminClient).mockReturnValue(client)

    const { createReviewRequestForIntake } = await import('../db')
    const result = await createReviewRequestForIntake({
      intake_record_id: 'intake-uuid',
      patient_name: 'No Contact Patient',
      therapist_name: 'David',
      service_type: 'physio',
      patient_id: 'patient-no-contact',
    })

    // Bug V: must always INSERT so admin sees pending row in dashboard
    expect(result).toBe('rr-uuid')
    const inserted = getInsert() as Record<string, unknown>
    expect(inserted.channel).toBe('email')
    expect(inserted.status).toBe('pending')
    expect(inserted.patient_phone).toBeNull()
    expect(inserted.patient_email).toBeNull()
  })
})

// ─── Bug U: canonical patient_name override ───────────────────────────────────
//
// Scenario: Whisper mis-transcribes "Ethan Liu" as "Easton Leo".
// Operator selects correct patient from directory (patient_id present).
// review_requests row MUST store patients.name ("Ethan Liu"), NOT the
// transcript name ("Easton Leo").

describe('createReviewRequestForIntake — Bug U: canonical patient_name from patients table', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses patients.name instead of input.patient_name when patient_id is provided', async () => {
    const { client, getInsert } = makeSupabase({
      patientRow: { name: 'Ethan Liu', phone: '+12368682134', email: null },
    })
    vi.mocked(createAdminClient).mockReturnValue(client)

    const { createReviewRequestForIntake } = await import('../db')
    await createReviewRequestForIntake({
      intake_record_id: 'intake-uuid',
      patient_name: 'Easton Leo', // Whisper mis-transcription
      therapist_name: 'David',
      service_type: 'physio',
      patient_id: 'patient-ethan',
    })

    const inserted = getInsert() as Record<string, unknown>
    // Must be canonical name from patients table, NOT Whisper transcript
    expect(inserted.patient_name).toBe('Ethan Liu')
  })

  it('falls back to input.patient_name when no patient_id is provided (unlinked visit, Bug V always inserts)', async () => {
    const { client, getInsert } = makeSupabase({ patientRow: null })
    vi.mocked(createAdminClient).mockReturnValue(client)

    const { createReviewRequestForIntake } = await import('../db')
    const result = await createReviewRequestForIntake({
      intake_record_id: 'intake-uuid',
      patient_name: 'Walk-In Patient',
      therapist_name: 'David',
      service_type: 'physio',
      // patient_id intentionally omitted
    })

    // Bug V: always INSERT; unlinked visit uses input.patient_name as fallback
    expect(result).toBe('rr-uuid')
    const inserted = getInsert() as Record<string, unknown>
    expect(inserted.patient_name).toBe('Walk-In Patient')
    expect(inserted.channel).toBe('email')
    expect(inserted.status).toBe('pending')
  })

  it('still uses patients.name even when patients row has email but no phone', async () => {
    const { client, getInsert } = makeSupabase({
      patientRow: { name: 'Jason Gao', phone: null, email: 'jasonusca@gmail.com' },
    })
    vi.mocked(createAdminClient).mockReturnValue(client)

    const { createReviewRequestForIntake } = await import('../db')
    await createReviewRequestForIntake({
      intake_record_id: 'intake-uuid',
      patient_name: 'Jeson Go', // Whisper garbled
      therapist_name: 'David',
      service_type: 'physio',
      patient_id: 'patient-jason',
    })

    const inserted = getInsert() as Record<string, unknown>
    expect(inserted.patient_name).toBe('Jason Gao')
  })
})
