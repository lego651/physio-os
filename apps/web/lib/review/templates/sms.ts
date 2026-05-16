// apps/web/lib/review/templates/sms.ts

const MAX_SMS_CHARS = 160
const FOOTER = ' Reply STOP to unsubscribe.'

export interface SmsBodyInput {
  senderName: string
  patientName: string
  shortLink: string
}

export function buildReviewSmsBody(input: SmsBodyInput): string {
  const link = input.shortLink
  const footer = FOOTER
  const firstName = input.patientName.split(/\s+/)[0] ?? 'there'
  let body = `${input.senderName}: Hi ${firstName}, quick Google review? ${link}${footer}`
  if (body.length <= MAX_SMS_CHARS) return body

  body = `${input.senderName}: Quick Google review? ${link}${footer}`
  if (body.length <= MAX_SMS_CHARS) return body

  body = `Quick Google review? ${link}${footer}`
  return body.slice(0, MAX_SMS_CHARS)
}
