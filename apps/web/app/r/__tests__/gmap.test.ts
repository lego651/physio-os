// apps/web/app/r/__tests__/gmap.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Supabase admin client
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}))

import { createAdminClient } from '@/lib/supabase/admin'
import { GET } from '../gmap/route'

const GOOGLE_FALLBACK = 'https://www.google.com/maps/place/V-Health+Rehab/'

function makeSupabase(row: Record<string, unknown> | null, updateError: unknown = null) {
  const updateChain = {
    eq: vi.fn().mockResolvedValue({ error: updateError }),
  }
  const update = vi.fn().mockReturnValue(updateChain)
  const selectChain = {
    eq: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: row, error: row ? null : { message: 'not found' } }),
    }),
  }
  const select = vi.fn().mockReturnValue(selectChain)
  return {
    client: { from: vi.fn().mockReturnValue({ select, update }) },
    update,
    updateChain,
  }
}

beforeEach(() => {
  delete process.env.VHEALTH_GOOGLE_REVIEW_URL
})

describe('GET /r/gmap', () => {
  it('returns 400 when t param is missing', async () => {
    const req = new Request('http://localhost/r/gmap')
    const res = await GET(req)
    expect(res.status).toBe(400)
  })

  it('returns 404 when token not found in DB', async () => {
    const { client } = makeSupabase(null)
    vi.mocked(createAdminClient).mockReturnValue(client as ReturnType<typeof createAdminClient>)
    const req = new Request('http://localhost/r/gmap?t=00000000-0000-0000-0000-000000000001')
    const res = await GET(req)
    expect(res.status).toBe(404)
  })

  it('returns 404 when request is revoked', async () => {
    const { client } = makeSupabase({
      id: 'req-1',
      status: 'revoked',
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    })
    vi.mocked(createAdminClient).mockReturnValue(client as ReturnType<typeof createAdminClient>)
    const req = new Request('http://localhost/r/gmap?t=00000000-0000-0000-0000-000000000001')
    const res = await GET(req)
    expect(res.status).toBe(404)
  })

  it('returns 404 when request is expired by timestamp', async () => {
    const { client } = makeSupabase({
      id: 'req-1',
      status: 'sent',
      expires_at: new Date(Date.now() - 1000).toISOString(),
    })
    vi.mocked(createAdminClient).mockReturnValue(client as ReturnType<typeof createAdminClient>)
    const req = new Request('http://localhost/r/gmap?t=00000000-0000-0000-0000-000000000001')
    const res = await GET(req)
    expect(res.status).toBe(404)
  })

  it('302-redirects to VHEALTH_GOOGLE_REVIEW_URL when set', async () => {
    process.env.VHEALTH_GOOGLE_REVIEW_URL = 'https://g.co/custom-review'
    const { client } = makeSupabase({
      id: 'req-1',
      status: 'sent',
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    })
    vi.mocked(createAdminClient).mockReturnValue(client as ReturnType<typeof createAdminClient>)
    const req = new Request('http://localhost/r/gmap?t=00000000-0000-0000-0000-000000000001')
    const res = await GET(req)
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('https://g.co/custom-review')
  })

  it('falls back to static Google Maps URL when env not set', async () => {
    const { client } = makeSupabase({
      id: 'req-1',
      status: 'sent',
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    })
    vi.mocked(createAdminClient).mockReturnValue(client as ReturnType<typeof createAdminClient>)
    const req = new Request('http://localhost/r/gmap?t=00000000-0000-0000-0000-000000000001')
    const res = await GET(req)
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe(GOOGLE_FALLBACK)
  })

  it('updates clicked_at and clicked_channel=gmap on valid token', async () => {
    const { client, update, updateChain } = makeSupabase({
      id: 'req-1',
      status: 'sent',
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    })
    vi.mocked(createAdminClient).mockReturnValue(client as ReturnType<typeof createAdminClient>)
    const req = new Request('http://localhost/r/gmap?t=00000000-0000-0000-0000-000000000001')
    await GET(req)
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ clicked_channel: 'gmap' }),
    )
    expect(updateChain.eq).toHaveBeenCalledWith('id', 'req-1')
  })
})
