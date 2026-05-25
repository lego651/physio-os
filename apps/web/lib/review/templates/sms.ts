// apps/web/lib/review/templates/sms.ts
//
// Variant C: dual-link SMS body for V-Health review requests.
// Target: ≤306 GSM-7 chars (2 segments) with realistic 36-char UUID tokens.
// GSM-7 only — no em-dash, no curly quotes, no Unicode outside the GSM-7 charset.
// Template (blank lines between sections for mobile readability):
//   V-Health Rehab - Hi {firstName}, help neighbors find us:
//
//   A) Leave a quick Google review:
//   {gmapLink}
//
//   B) AI writes it for you (30s):
//   {aiLink}
//
//   Code JG = 10% off. Reply STOP.

export interface SmsBodyInput {
  firstName: string
  gmapLink: string
  aiLink: string
}

export function buildReviewSmsBody(input: SmsBodyInput): string {
  return (
    `V-Health Rehab - Hi ${input.firstName}, help neighbors find us:\n\n` +
    `A) Leave a quick Google review:\n${input.gmapLink}\n\n` +
    `B) AI writes it for you (30s):\n${input.aiLink}\n\n` +
    `Code JG = 10% off. Reply STOP.`
  )
}
