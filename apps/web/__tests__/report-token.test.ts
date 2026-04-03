import { describe, it, expect } from 'vitest'

// ---------------------------------------------------------------------------
// Report JWT token verification logic (S402 branch — not yet merged).
// Pure token validation logic extracted and tested in isolation.
// ---------------------------------------------------------------------------

type TokenPayload = {
  sub: string        // patientId
  reportId: string
  iat: number
  exp: number
}

type VerifyResult =
  | { valid: true; payload: TokenPayload }
  | { valid: false; reason: 'expired' | 'invalid' | 'missing' }

/**
 * Extracted token verification logic.
 * In production this delegates to `jose` for JWT operations;
 * here we test the structural validation layer independently.
 */
function verifyReportTokenPayload(
  payload: unknown,
  nowMs: number,
): VerifyResult {
  if (!payload || typeof payload !== 'object') {
    return { valid: false, reason: 'invalid' }
  }

  const p = payload as Record<string, unknown>

  if (typeof p.sub !== 'string' || !p.sub) {
    return { valid: false, reason: 'invalid' }
  }

  if (typeof p.reportId !== 'string' || !p.reportId) {
    return { valid: false, reason: 'invalid' }
  }

  if (typeof p.exp !== 'number') {
    return { valid: false, reason: 'invalid' }
  }

  const nowSec = Math.floor(nowMs / 1000)
  if (p.exp < nowSec) {
    return { valid: false, reason: 'expired' }
  }

  return {
    valid: true,
    payload: {
      sub: p.sub as string,
      reportId: p.reportId as string,
      iat: (p.iat as number) ?? 0,
      exp: p.exp as number,
    },
  }
}

/** Build a token payload that expires at a given unix timestamp. */
function makePayload(overrides: Partial<TokenPayload> = {}): TokenPayload {
  const now = Math.floor(Date.now() / 1000)
  return {
    sub: 'patient-abc',
    reportId: 'report-xyz',
    iat: now,
    exp: now + 60 * 60, // 1 hour from now
    ...overrides,
  }
}

// ---------------------------------------------------------------------------

describe('verifyReportTokenPayload — valid tokens', () => {
  const NOW_MS = new Date('2026-04-03T12:00:00Z').getTime()

  it('accepts a well-formed payload that has not expired', () => {
    const payload = makePayload({ exp: Math.floor(NOW_MS / 1000) + 3600 })
    const result = verifyReportTokenPayload(payload, NOW_MS)
    expect(result.valid).toBe(true)
  })

  it('returns the patient id from the sub claim', () => {
    const payload = makePayload({ sub: 'patient-123', exp: Math.floor(NOW_MS / 1000) + 3600 })
    const result = verifyReportTokenPayload(payload, NOW_MS)
    if (result.valid) {
      expect(result.payload.sub).toBe('patient-123')
    }
  })

  it('returns the reportId from the payload', () => {
    const payload = makePayload({ reportId: 'rpt-456', exp: Math.floor(NOW_MS / 1000) + 3600 })
    const result = verifyReportTokenPayload(payload, NOW_MS)
    if (result.valid) {
      expect(result.payload.reportId).toBe('rpt-456')
    }
  })
})

describe('verifyReportTokenPayload — expired tokens', () => {
  const NOW_MS = new Date('2026-04-03T12:00:00Z').getTime()

  it('returns expired reason when exp is in the past', () => {
    const payload = makePayload({ exp: Math.floor(NOW_MS / 1000) - 1 })
    const result = verifyReportTokenPayload(payload, NOW_MS)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.reason).toBe('expired')
    }
  })

  it('returns expired reason for tokens expired long ago', () => {
    const payload = makePayload({ exp: Math.floor(NOW_MS / 1000) - 7 * 24 * 3600 })
    const result = verifyReportTokenPayload(payload, NOW_MS)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.reason).toBe('expired')
    }
  })

  it('accepts a token expiring in exactly 1 second', () => {
    const payload = makePayload({ exp: Math.floor(NOW_MS / 1000) + 1 })
    const result = verifyReportTokenPayload(payload, NOW_MS)
    expect(result.valid).toBe(true)
  })
})

describe('verifyReportTokenPayload — invalid / malformed tokens', () => {
  const NOW_MS = new Date('2026-04-03T12:00:00Z').getTime()

  it('returns invalid for null payload', () => {
    const result = verifyReportTokenPayload(null, NOW_MS)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.reason).toBe('invalid')
    }
  })

  it('returns invalid for non-object payload', () => {
    const result = verifyReportTokenPayload('not-an-object', NOW_MS)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.reason).toBe('invalid')
    }
  })

  it('returns invalid when sub is missing', () => {
    const { sub: _sub, ...noSub } = makePayload({ exp: Math.floor(NOW_MS / 1000) + 3600 })
    const result = verifyReportTokenPayload(noSub, NOW_MS)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.reason).toBe('invalid')
    }
  })

  it('returns invalid when reportId is missing', () => {
    const { reportId: _rid, ...noReportId } = makePayload({ exp: Math.floor(NOW_MS / 1000) + 3600 })
    const result = verifyReportTokenPayload(noReportId, NOW_MS)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.reason).toBe('invalid')
    }
  })

  it('returns invalid when exp is not a number', () => {
    const payload = { ...makePayload(), exp: 'not-a-number' }
    const result = verifyReportTokenPayload(payload, NOW_MS)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.reason).toBe('invalid')
    }
  })

  it('returns invalid for an empty object', () => {
    const result = verifyReportTokenPayload({}, NOW_MS)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.reason).toBe('invalid')
    }
  })
})
