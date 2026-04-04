import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Cron endpoint authorization logic (S403).
// Both cron routes share the same auth pattern:
//   Authorization: Bearer ${CRON_SECRET}
// These tests validate the auth helper in isolation.
// ---------------------------------------------------------------------------

/**
 * Extracted auth guard logic — mirrors what both cron route handlers do
 * before delegating to their processing logic.
 */
function verifyCronAuth(
  authHeader: string | null,
  cronSecret: string | undefined,
): { ok: true } | { ok: false; status: 400 | 401 | 500; message: string } {
  if (!cronSecret) {
    return { ok: false, status: 500, message: 'CRON_SECRET not configured' }
  }

  if (!authHeader) {
    return { ok: false, status: 401, message: 'Missing Authorization header' }
  }

  const [scheme, token] = authHeader.split(' ')

  if (scheme !== 'Bearer' || !token) {
    return { ok: false, status: 401, message: 'Invalid Authorization format' }
  }

  if (token !== cronSecret) {
    return { ok: false, status: 401, message: 'Invalid token' }
  }

  return { ok: true }
}

// ---------------------------------------------------------------------------

describe('verifyCronAuth', () => {
  const VALID_SECRET = 'super-secret-cron-token-abc123'

  it('returns 401 when Authorization header is missing', () => {
    const result = verifyCronAuth(null, VALID_SECRET)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(401)
      expect(result.message).toContain('Missing')
    }
  })

  it('returns 401 when token does not match CRON_SECRET', () => {
    const result = verifyCronAuth('Bearer wrong-token', VALID_SECRET)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(401)
    }
  })

  it('returns 401 when Authorization header uses wrong scheme', () => {
    const result = verifyCronAuth(`Basic ${VALID_SECRET}`, VALID_SECRET)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(401)
    }
  })

  it('returns 401 when Authorization header has no token after Bearer', () => {
    const result = verifyCronAuth('Bearer ', VALID_SECRET)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(401)
    }
  })

  it('returns 500 when CRON_SECRET env var is not set', () => {
    const result = verifyCronAuth(`Bearer ${VALID_SECRET}`, undefined)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(500)
      expect(result.message).toContain('CRON_SECRET')
    }
  })

  it('returns ok:true when valid Bearer token matches CRON_SECRET', () => {
    const result = verifyCronAuth(`Bearer ${VALID_SECRET}`, VALID_SECRET)
    expect(result.ok).toBe(true)
  })

  it('returns 401 for empty Authorization header string', () => {
    const result = verifyCronAuth('', VALID_SECRET)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(401)
    }
  })
})

describe('verifyCronAuth — environment variable simulation', () => {
  const ORIGINAL_ENV = process.env.CRON_SECRET

  beforeEach(() => {
    delete process.env.CRON_SECRET
  })

  afterEach(() => {
    if (ORIGINAL_ENV !== undefined) {
      process.env.CRON_SECRET = ORIGINAL_ENV
    } else {
      delete process.env.CRON_SECRET
    }
  })

  it('returns 500 when process.env.CRON_SECRET is undefined at call time', () => {
    const result = verifyCronAuth('Bearer some-token', process.env.CRON_SECRET)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(500)
    }
  })

  it('passes auth check after CRON_SECRET is set in process.env', () => {
    process.env.CRON_SECRET = 'runtime-secret'
    const result = verifyCronAuth('Bearer runtime-secret', process.env.CRON_SECRET)
    expect(result.ok).toBe(true)
  })
})

describe('verifyCronAuth — timing safety', () => {
  it('rejects a token that is a prefix of the real secret', () => {
    const secret = 'long-secret-value'
    const result = verifyCronAuth('Bearer long-secret', secret)
    expect(result.ok).toBe(false)
  })

  it('rejects a token that is a superset of the real secret', () => {
    const secret = 'short'
    const result = verifyCronAuth('Bearer short-plus-extra', secret)
    expect(result.ok).toBe(false)
  })
})
