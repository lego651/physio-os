// apps/web/lib/review/templates/sms.ts
//
// Single primary CTA + secondary assist SMS body for V-Health review requests.
// GSM-7 only — no em-dash, no curly quotes, no Unicode outside the GSM-7 charset.
// Template (blank lines between sections for mobile readability):
//   V-Health Rehab - Hi {firstName}, help neighbors find us:
//
//   Leave us a Google review:
//   {gmapLink}
//
//   Even simpler: pick a few words about today's visit, we'll write it:
//   {aiLink}
//
//   Thanks for your help! Use code JG for 10% off your next visit.
//
//   Reply STOP to opt out.

export interface SmsBodyInput {
  firstName: string
  gmapLink: string
  aiLink: string
}

export function buildReviewSmsBody(input: SmsBodyInput): string {
  return (
    `V-Health Rehab - Hi ${input.firstName}, help neighbors find us:\n\n` +
    `Leave us a Google review:\n${input.gmapLink}\n\n` +
    `Even simpler: pick a few words about today's visit, we'll write it:\n${input.aiLink}\n\n` +
    `Thanks for your help! Use code JG for 10% off your next visit.\n\n` +
    `Reply STOP to opt out.`
  )
}
