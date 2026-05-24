import { describe, it, expect, vi } from 'vitest'

// Mock the helper modules — paths must match the relative imports used by ../route.ts
// (vitest at the repo root has no `@/` alias configured, so relative paths are required)
vi.mock('../../../../../lib/intake/db', () => ({
  saveIntakeRecord: vi.fn().mockResolvedValue({
    id: 'test-uuid',
    clinic_id: 'vhealth',
    patient_name: 'Jane Doe',
    date_of_visit: '2026-05-13',
    therapist_name: 'David',
    treatment_area: 'neck',
    session_notes: 'Dry needling session',
    session_type: 'physio',
    source: 'in_app',
    raw_transcript: null,
    patient_id: null,
    created_at: '2026-05-13T00:00:00Z',
    updated_at: '2026-05-13T00:00:00Z',
  }),
  createReviewRequestForIntake: vi.fn().mockResolvedValue('rr-uuid-123'),
  createPatient: vi.fn(),
}))

describe('POST /api/intake/save', () => {
  it('returns 400 when required fields are missing', async () => {
    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/intake/save', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        patient_name: '',
        date_of_visit: '',
        therapist_name: 'David',
        treatment_area: 'neck',
        session_notes: 'Dry needling session',
      }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 200 with saved record when all fields are valid', async () => {
    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/intake/save', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        patient_name: 'Jane Doe',
        date_of_visit: '2026-05-13',
        therapist_name: 'David',
        treatment_area: 'neck',
        session_notes: 'Dry needling session',
        source: 'in_app',
        raw_transcript: 'Patient Jane Doe, neck pain, dry needling',
      }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.record.id).toBe('test-uuid')
    expect(body.record.patient_name).toBe('Jane Doe')

    const { saveIntakeRecord } = await import('../../../../../lib/intake/db')
    expect(saveIntakeRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'in_app',
        raw_transcript: 'Patient Jane Doe, neck pain, dry needling',
      }),
    )
  })

  it('defaults source to manual when not provided', async () => {
    const { POST } = await import('../route')
    const { saveIntakeRecord } = await import('../../../../../lib/intake/db')
    vi.mocked(saveIntakeRecord).mockClear()

    const req = new Request('http://localhost/api/intake/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patient_name: 'No Source Test',
        date_of_visit: '2026-05-13',
        therapist_name: 'David',
        treatment_area: 'shoulder',
        session_notes: 'Test notes',
        // source intentionally omitted
      }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(saveIntakeRecord).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'manual', raw_transcript: null }),
    )
  })

  it('auto-creates a review_requests row and returns review_request_id', async () => {
    const { POST } = await import('../route')
    const { createReviewRequestForIntake } = await import('../../../../../lib/intake/db')
    vi.mocked(createReviewRequestForIntake).mockClear()

    const req = new Request('http://localhost/api/intake/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patient_name: 'Jane Doe',
        date_of_visit: '2026-05-13',
        therapist_name: 'David',
        treatment_area: 'neck',
        session_notes: 'Dry needling session',
        session_type: 'physio',
        source: 'in_app',
        raw_transcript: null,
      }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.record.id).toBe('test-uuid')
    expect(body.review_request_id).toBe('rr-uuid-123')
    expect(createReviewRequestForIntake).toHaveBeenCalledWith(
      expect.objectContaining({
        intake_record_id: 'test-uuid',
        patient_name: 'Jane Doe',
        therapist_name: 'David',
        service_type: 'physio',
      }),
    )
  })

  it('returns 200 with record + null review_request_id when review-row insert fails', async () => {
    const { POST } = await import('../route')
    const { createReviewRequestForIntake } = await import('../../../../../lib/intake/db')
    vi.mocked(createReviewRequestForIntake).mockRejectedValueOnce(new Error('DB down'))

    const req = new Request('http://localhost/api/intake/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patient_name: 'Jane Doe',
        date_of_visit: '2026-05-13',
        therapist_name: 'David',
        treatment_area: 'neck',
        session_notes: 'Dry needling session',
        session_type: 'physio',
        source: 'in_app',
      }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.record.id).toBe('test-uuid')
    expect(body.review_request_id).toBeNull()
  })

  it('skips review_requests auto-create when session_type is omitted (manual form path)', async () => {
    const { POST } = await import('../route')
    const { createReviewRequestForIntake } = await import('../../../../../lib/intake/db')
    vi.mocked(createReviewRequestForIntake).mockClear()

    const req = new Request('http://localhost/api/intake/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patient_name: 'Manual Patient',
        date_of_visit: '2026-05-13',
        therapist_name: 'David',
        treatment_area: 'knee',
        session_notes: 'Manual entry',
        source: 'manual',
        // session_type intentionally omitted
      }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.record.id).toBe('test-uuid')
    expect(body.review_request_id).toBeNull()
    expect(createReviewRequestForIntake).not.toHaveBeenCalled()
  })

  // ── S1.7-4/5: patient_id support ─────────────────────────────────────────────

  it('passes patient_id to saveIntakeRecord when provided', async () => {
    const { POST } = await import('../route')
    const { saveIntakeRecord } = await import('../../../../../lib/intake/db')
    vi.mocked(saveIntakeRecord).mockClear()

    const PATIENT_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
    const req = new Request('http://localhost/api/intake/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patient_name: 'Jason Gao',
        date_of_visit: '2026-05-23',
        therapist_name: 'David',
        treatment_area: 'neck',
        session_notes: 'Follow-up',
        session_type: 'physio',
        source: 'in_app',
        patient_id: PATIENT_UUID,
      }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(saveIntakeRecord).toHaveBeenCalledWith(
      expect.objectContaining({ patient_id: PATIENT_UUID }),
    )
  })

  it('saves without patient_id when omitted (backward-compatible)', async () => {
    const { POST } = await import('../route')
    const { saveIntakeRecord } = await import('../../../../../lib/intake/db')
    vi.mocked(saveIntakeRecord).mockClear()

    const req = new Request('http://localhost/api/intake/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patient_name: 'Jane Doe',
        date_of_visit: '2026-05-23',
        therapist_name: 'David',
        treatment_area: 'shoulder',
        session_notes: 'Normal',
        session_type: 'physio',
        source: 'in_app',
        // patient_id intentionally omitted
      }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(saveIntakeRecord).toHaveBeenCalledWith(
      expect.objectContaining({ patient_id: undefined }),
    )
  })

  it('returns patient_id in response body when provided', async () => {
    const { POST } = await import('../route')
    const { saveIntakeRecord } = await import('../../../../../lib/intake/db')
    const PATIENT_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
    vi.mocked(saveIntakeRecord).mockResolvedValueOnce({
      id: 'test-uuid',
      clinic_id: 'vhealth',
      patient_name: 'Jason Gao',
      date_of_visit: '2026-05-23',
      therapist_name: 'David',
      treatment_area: 'neck',
      session_notes: 'Follow-up session',
      session_type: 'physio',
      source: 'in_app',
      raw_transcript: null,
      patient_id: PATIENT_UUID,
      created_at: '2026-05-23T00:00:00Z',
      updated_at: '2026-05-23T00:00:00Z',
    })

    const req = new Request('http://localhost/api/intake/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patient_name: 'Jason Gao',
        date_of_visit: '2026-05-23',
        therapist_name: 'David',
        treatment_area: 'neck',
        session_notes: 'Follow-up session',
        session_type: 'physio',
        source: 'in_app',
        patient_id: PATIENT_UUID,
      }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.record.patient_id).toBe(PATIENT_UUID)
  })
})
