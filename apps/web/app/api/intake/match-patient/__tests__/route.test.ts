import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the matcher lib so route tests don't touch DB or LLM
vi.mock('../../../../../lib/intake/match-patient', () => ({
  matchPatient: vi.fn().mockResolvedValue([
    {
      id: 'patient-uuid-1',
      name: 'Jason Gao',
      phone_suffix4: null,
      email_partial: 'jas...@gmail.com',
      last_seen_at: '2026-04-15',
    },
  ]),
}))

// Mock the admin client — supabase chain for clinic slug lookup + matchPatient
const mockMatchPatient = vi.fn()
let mockClinicData: { id: string } | null = { id: 'clinic-uuid-from-slug' }
let mockClinicError: { message: string } | null = null

vi.mock('../../../../../lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === 'clinics') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() =>
                Promise.resolve({ data: mockClinicData, error: mockClinicError }),
              ),
            })),
          })),
        }
      }
      return { from: vi.fn() }
    }),
  })),
}))

describe('POST /api/intake/match-patient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockClinicData = { id: 'clinic-uuid-from-slug' }
    mockClinicError = null
  })

  it('returns 200 with candidates for a valid request with clinic slug', async () => {
    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/intake/match-patient', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clinic_id: 'vhealth', name: 'Jason' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.candidates)).toBe(true)
    expect(body.candidates[0].id).toBe('patient-uuid-1')
    expect(body.candidates[0].name).toBe('Jason Gao')
  })

  it('resolves clinic slug to UUID before calling matchPatient', async () => {
    const { matchPatient } = await import('../../../../../lib/intake/match-patient')
    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/intake/match-patient', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clinic_id: 'vhealth', name: 'Ethan Liu' }),
    })
    await POST(req)
    // matchPatient must be called with the UUID resolved from the slug, NOT 'vhealth'
    expect(vi.mocked(matchPatient)).toHaveBeenCalledWith(
      'clinic-uuid-from-slug',
      'Ethan Liu',
      expect.anything(),
    )
  })

  it('returns 404 when clinic slug is not found', async () => {
    mockClinicData = null
    mockClinicError = { message: 'no rows returned' }
    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/intake/match-patient', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clinic_id: 'unknown-clinic', name: 'Jason' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toMatch(/clinic/i)
  })

  it('returns 400 when name is missing', async () => {
    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/intake/match-patient', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clinic_id: 'vhealth' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 when clinic_id is missing', async () => {
    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/intake/match-patient', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Jason' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 when name is empty string', async () => {
    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/intake/match-patient', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clinic_id: 'vhealth', name: '' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 when name is whitespace only', async () => {
    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/intake/match-patient', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clinic_id: 'vhealth', name: '   ' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns { candidates: [] } when no matches found', async () => {
    const { matchPatient } = await import('../../../../../lib/intake/match-patient')
    vi.mocked(matchPatient).mockResolvedValueOnce([])

    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/intake/match-patient', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clinic_id: 'vhealth', name: 'Mary' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.candidates).toEqual([])
  })
})
