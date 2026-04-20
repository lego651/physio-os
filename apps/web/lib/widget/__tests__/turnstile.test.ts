import { describe, it, expect, vi, beforeEach } from 'vitest'
import { verifyTurnstile } from '../turnstile'

describe('verifyTurnstile', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    process.env.TURNSTILE_SECRET_KEY = 'secret'
  })
  it('returns true on success=true', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    )
    expect(await verifyTurnstile('token', '1.2.3.4')).toBe(true)
  })
  it('returns false on success=false', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: false }), { status: 200 }),
    )
    expect(await verifyTurnstile('bad', '1.2.3.4')).toBe(false)
  })
  it('returns false if secret missing', async () => {
    delete process.env.TURNSTILE_SECRET_KEY
    expect(await verifyTurnstile('t', '1.2.3.4')).toBe(false)
  })
})
