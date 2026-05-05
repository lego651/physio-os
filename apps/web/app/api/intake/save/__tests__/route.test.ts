import { describe, it, expect, vi } from 'vitest'

// Mock the helper modules — paths must match the relative imports used by ../route.ts
// (vitest at the repo root has no `@/` alias configured, so relative paths are required)
vi.mock('../../../../../lib/intake/db', () => ({
  saveIntakeRecord: vi.fn().mockResolvedValue({
    id:             'test-uuid',
    clinic_id:      'vhealth',
    patient_name:   'Jane Doe',
    date_of_visit:  '2026-05-13',
    therapist_name: 'David',
    treatment_area: 'neck',
    session_notes:  'Dry needling session',
    source:         'in_app',
    raw_transcript: null,
    created_at:     '2026-05-13T00:00:00Z',
    updated_at:     '2026-05-13T00:00:00Z',
  }),
}))

describe('POST /api/intake/save', () => {
  it('returns 400 when required fields are missing', async () => {
    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/intake/save', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        patient_name:   '',
        date_of_visit:  '',
        therapist_name: 'David',
        treatment_area: 'neck',
        session_notes:  'Dry needling session',
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
        patient_name:   'Jane Doe',
        date_of_visit:  '2026-05-13',
        therapist_name: 'David',
        treatment_area: 'neck',
        session_notes:  'Dry needling session',
        source:         'in_app',
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
      })
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
        patient_name:   'No Source Test',
        date_of_visit:  '2026-05-13',
        therapist_name: 'David',
        treatment_area: 'shoulder',
        session_notes:  'Test notes',
        // source intentionally omitted
      }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(saveIntakeRecord).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'manual', raw_transcript: null })
    )
  })
})
