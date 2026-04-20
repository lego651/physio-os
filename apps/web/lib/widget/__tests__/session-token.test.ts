import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SignJWT } from 'jose'
import { signSessionToken, verifySessionToken } from '../session-token'

const SECRET_A = 'a'.repeat(48)
const SECRET_B = 'b'.repeat(48)

describe('session-token', () => {
  const original = process.env.WIDGET_SESSION_SECRET
  beforeEach(() => { process.env.WIDGET_SESSION_SECRET = SECRET_A })
  afterEach(() => {
    if (original === undefined) delete process.env.WIDGET_SESSION_SECRET
    else process.env.WIDGET_SESSION_SECRET = original
  })

  it('sign + verify round-trip succeeds', async () => {
    const payload = { cid: '11111111-1111-1111-1111-111111111111', clinic: 'vhealth', iph: 'ip_42' }
    const token = await signSessionToken(payload)
    const verified = await verifySessionToken(token)
    expect(verified).toEqual(payload)
  })

  it('returns null for a structurally invalid token', async () => {
    const verified = await verifySessionToken('not-a-jwt')
    expect(verified).toBeNull()
  })

  it('returns null when the secret was rotated (signature mismatch)', async () => {
    const token = await signSessionToken({ cid: 'c', clinic: 'x', iph: 'y' })
    process.env.WIDGET_SESSION_SECRET = SECRET_B
    const verified = await verifySessionToken(token)
    expect(verified).toBeNull()
  })

  it('returns null for an expired token', async () => {
    const secret = new TextEncoder().encode(SECRET_A)
    const expired = await new SignJWT({ cid: 'c', clinic: 'x', iph: 'y' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('physio-os/widget')
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(secret)
    const verified = await verifySessionToken(expired)
    expect(verified).toBeNull()
  })

  it('returns null when the issuer is wrong', async () => {
    const secret = new TextEncoder().encode(SECRET_A)
    const badIss = await new SignJWT({ cid: 'c', clinic: 'x', iph: 'y' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('attacker')
      .setIssuedAt()
      .setExpirationTime('2h')
      .sign(secret)
    expect(await verifySessionToken(badIss)).toBeNull()
  })

  it('throws when signing without a secret configured', async () => {
    delete process.env.WIDGET_SESSION_SECRET
    await expect(signSessionToken({ cid: 'c', clinic: 'x', iph: 'y' })).rejects.toThrow(
      /WIDGET_SESSION_SECRET/,
    )
  })

  it('throws when secret is too short', async () => {
    process.env.WIDGET_SESSION_SECRET = 'short'
    await expect(signSessionToken({ cid: 'c', clinic: 'x', iph: 'y' })).rejects.toThrow(
      />=32 chars/,
    )
  })
})
