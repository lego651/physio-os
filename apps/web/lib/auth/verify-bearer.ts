import { timingSafeEqual } from 'node:crypto'

/**
 * Timing-safe Bearer token verification.
 * Returns true if the request's Authorization header matches `Bearer <secret>`.
 */
export function verifyBearerToken(req: Request, secret: string): boolean {
  const authHeader = req.headers.get('authorization') ?? ''
  const expected = `Bearer ${secret}`

  if (authHeader.length !== expected.length) return false

  const a = Buffer.from(authHeader, 'utf-8')
  const b = Buffer.from(expected, 'utf-8')
  return timingSafeEqual(a, b)
}
