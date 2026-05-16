// apps/web/lib/review/tokens.ts
//
// HS256 JWTs that bind a review request id + clinic id to a short link.
// Separate secret from the widget so a leak on one product does not
// compromise the other.
import { SignJWT, jwtVerify } from 'jose'

const ISSUER = 'physio-os/review'

function getSecret(): Uint8Array {
  const s = process.env.REVIEW_TOKEN_SECRET
  if (!s || s.length < 32) {
    throw new Error('REVIEW_TOKEN_SECRET missing or too short (need >=32 chars)')
  }
  return new TextEncoder().encode(s)
}

export interface ReviewTokenPayload {
  requestId: string
  clinicId: string
  jti: string
}

export interface MintInput extends ReviewTokenPayload {
  expiresInDays: number
}

export async function mintReviewToken(input: MintInput): Promise<string> {
  const expSeconds = Math.floor(Date.now() / 1000) + Math.floor(input.expiresInDays * 86400)
  return new SignJWT({ rid: input.requestId, cid: input.clinicId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ISSUER)
    .setJti(input.jti)
    .setIssuedAt()
    .setExpirationTime(expSeconds)
    .sign(getSecret())
}

export async function verifyReviewToken(token: string): Promise<ReviewTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), { issuer: ISSUER })
    if (
      typeof payload.rid !== 'string' ||
      typeof payload.cid !== 'string' ||
      typeof payload.jti !== 'string'
    ) {
      return null
    }
    return { requestId: payload.rid, clinicId: payload.cid, jti: payload.jti }
  } catch {
    return null
  }
}
