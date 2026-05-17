// apps/web/lib/review/templates/sms.ts

// Single-segment SMS is 160 GSM chars. The JWT-based short link is ~250 chars,
// so this body is almost always multi-segment. NEVER truncate — that breaks
// the URL. Twilio bills per segment; acceptable cost for now. If cost matters
// later, replace JWT with a DB-backed short token (8 chars) and shorten body.
const FOOTER = ' Reply STOP to unsubscribe.'

export interface SmsBodyInput {
  senderName: string
  patientName: string
  shortLink: string
}

export function buildReviewSmsBody(input: SmsBodyInput): string {
  const firstName = input.patientName.split(/\s+/)[0] ?? 'there'
  return `${input.senderName}: Hi ${firstName}, quick Google review? ${input.shortLink}${FOOTER}`
}
