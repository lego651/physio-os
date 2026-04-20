// apps/web/lib/widget/session-token.ts
//
// Short-lived HS256 JWTs that cryptographically bind a widget conversation to
// its originating IP + clinic slug. Required to prevent replay attacks against
// /api/widget/chat and /api/widget/lead where a raw conversationId was enough
// to drain the Anthropic API key.
import { SignJWT, jwtVerify } from 'jose'

const ISSUER = 'physio-os/widget'
const EXPIRY = '2h'

function getSecret(): Uint8Array {
  const s = process.env.WIDGET_SESSION_SECRET
  if (!s || s.length < 32) {
    throw new Error('WIDGET_SESSION_SECRET missing or too short (need >=32 chars)')
  }
  return new TextEncoder().encode(s)
}

export interface WidgetSessionPayload {
  cid: string
  clinic: string
  iph: string
}

export async function signSessionToken(payload: WidgetSessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(EXPIRY)
    .sign(getSecret())
}

export async function verifySessionToken(token: string): Promise<WidgetSessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), { issuer: ISSUER })
    if (
      typeof payload.cid !== 'string' ||
      typeof payload.clinic !== 'string' ||
      typeof payload.iph !== 'string'
    ) {
      return null
    }
    return { cid: payload.cid, clinic: payload.clinic, iph: payload.iph }
  } catch {
    return null
  }
}
