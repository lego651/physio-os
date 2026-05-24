// apps/web/lib/review/templates/sms.ts
//
// Variant C: dual-link SMS body for V-Health review requests.
// Target: ≤160 GSM chars (1 segment) with realistic 36-char UUID tokens.
// Template:
//   V-Health Rehab — Hi {firstName}, help neighbors find us:
//   A) Google: {gmapLink}
//   B) AI helps (30s): {aiLink}
//   Code JG = 10% off next visit. Reply STOP to opt out.

export interface SmsBodyInput {
  firstName: string
  gmapLink: string
  aiLink: string
}

export function buildReviewSmsBody(input: SmsBodyInput): string {
  return (
    `V-Health Rehab — Hi ${input.firstName}, help neighbors find us:\n` +
    `A) Google: ${input.gmapLink}\n` +
    `B) AI helps (30s): ${input.aiLink}\n` +
    `Code JG = 10% off next visit. Reply STOP to opt out.`
  )
}
