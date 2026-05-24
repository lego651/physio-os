import { describe, it, expect, vi } from 'vitest'

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

// Mock the admin client
vi.mock('../../../../../lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn(),
  })),
}))

describe('POST /api/intake/match-patient', () => {
  it('returns 200 with candidates for a valid request', async () => {
    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/intake/match-patient', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clinic_id: 'clinic-uuid', name: 'Jason' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.candidates)).toBe(true)
    expect(body.candidates[0].id).toBe('patient-uuid-1')
    expect(body.candidates[0].name).toBe('Jason Gao')
  })

  it('returns 400 when name is missing', async () => {
    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/intake/match-patient', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clinic_id: 'clinic-uuid' }),
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
      body: JSON.stringify({ clinic_id: 'clinic-uuid', name: '' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 when name is whitespace only', async () => {
    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/intake/match-patient', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clinic_id: 'clinic-uuid', name: '   ' }),
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
      body: JSON.stringify({ clinic_id: 'clinic-uuid', name: 'Mary' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.candidates).toEqual([])
  })
})
