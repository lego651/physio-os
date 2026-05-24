import { describe, it, expect, vi } from 'vitest'

// Mock the db helper so tests don't touch real DB
vi.mock('../../../../../lib/intake/db', () => ({
  createPatient: vi.fn().mockResolvedValue({
    id: 'new-patient-uuid',
    name: 'Jason Gao',
    phone: null,
    email: 'jasonusca@gmail.com',
  }),
  saveIntakeRecord: vi.fn(),
  createReviewRequestForIntake: vi.fn(),
}))

describe('POST /api/intake/create-patient', () => {
  it('returns 200 with patient id and name on valid request', async () => {
    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/intake/create-patient', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        clinic_id: 'clinic-uuid',
        name: 'Jason Gao',
        email: 'jasonusca@gmail.com',
      }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.id).toBe('new-patient-uuid')
    expect(body.name).toBe('Jason Gao')
  })

  it('returns 400 when clinic_id is missing', async () => {
    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/intake/create-patient', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Jason Gao' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 when name is missing', async () => {
    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/intake/create-patient', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clinic_id: 'clinic-uuid' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('accepts a request with name only (phone and email both optional)', async () => {
    const { POST } = await import('../route')
    const { createPatient } = await import('../../../../../lib/intake/db')
    vi.mocked(createPatient).mockResolvedValueOnce({
      id: 'name-only-uuid',
      name: 'Name Only',
      phone: null,
      email: null,
    })
    const req = new Request('http://localhost/api/intake/create-patient', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clinic_id: 'clinic-uuid', name: 'Name Only' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.id).toBe('name-only-uuid')
  })

  it('returns 500 when db insert throws', async () => {
    const { POST } = await import('../route')
    const { createPatient } = await import('../../../../../lib/intake/db')
    vi.mocked(createPatient).mockRejectedValueOnce(new Error('DB error'))
    const req = new Request('http://localhost/api/intake/create-patient', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clinic_id: 'clinic-uuid', name: 'Jason Gao' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(500)
  })
})
