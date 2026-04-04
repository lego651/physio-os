import { describe, it, expect } from 'vitest'

// ---------------------------------------------------------------------------
// Nudge eligibility logic (S404 branch — not yet merged).
// Pure function extracted and tested here in isolation.
// ---------------------------------------------------------------------------

type Patient = {
  id: string
  created_at: string
  opted_out: boolean
  consent_given: boolean
}

type Message = {
  created_at: string
  direction: 'inbound' | 'outbound'
  is_nudge?: boolean
}

/**
 * Determine whether a patient is eligible to receive a nudge SMS.
 *
 * Rules:
 * 1. Patient must have given consent.
 * 2. Patient must not be opted-out.
 * 3. Patient must be inactive (no inbound message) for 3+ days.
 * 4. Patient must not have already received a nudge during this inactive period
 *    (i.e., no outbound nudge sent after the last inbound message).
 * 5. Patient with no messages ever is eligible if the account is > 3 days old.
 */
function isNudgeEligible(
  patient: Patient,
  messages: Message[],
  nowMs: number,
): boolean {
  if (!patient.consent_given) return false
  if (patient.opted_out) return false

  const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000

  if (messages.length === 0) {
    const accountAgeMs = nowMs - new Date(patient.created_at).getTime()
    return accountAgeMs >= THREE_DAYS_MS
  }

  // Find last inbound message
  const inboundMessages = messages
    .filter(m => m.direction === 'inbound')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  if (inboundMessages.length === 0) {
    // Only outbound — treat account creation as last activity
    const accountAgeMs = nowMs - new Date(patient.created_at).getTime()
    return accountAgeMs >= THREE_DAYS_MS
  }

  const lastInboundMs = new Date(inboundMessages[0].created_at).getTime()
  const inactiveDurationMs = nowMs - lastInboundMs

  if (inactiveDurationMs < THREE_DAYS_MS) return false

  // Check if a nudge was already sent after the last inbound message
  const nudgeSentAfterLastInbound = messages.some(
    m =>
      m.direction === 'outbound' &&
      m.is_nudge === true &&
      new Date(m.created_at).getTime() > lastInboundMs,
  )

  return !nudgeSentAfterLastInbound
}

// ---------------------------------------------------------------------------
// Reference timestamps
// ---------------------------------------------------------------------------

const NOW = new Date('2026-04-03T12:00:00Z').getTime()
const daysAgo = (n: number) => new Date(NOW - n * 24 * 60 * 60 * 1000).toISOString()

const BASE_PATIENT: Patient = {
  id: 'patient-1',
  created_at: daysAgo(30),
  opted_out: false,
  consent_given: true,
}

// ---------------------------------------------------------------------------

describe('isNudgeEligible', () => {
  it('returns true when patient has been inactive for 3+ days', () => {
    const messages: Message[] = [
      { created_at: daysAgo(5), direction: 'inbound' },
    ]
    expect(isNudgeEligible(BASE_PATIENT, messages, NOW)).toBe(true)
  })

  it('returns false when patient has been inactive for only 2 days', () => {
    const messages: Message[] = [
      { created_at: daysAgo(2), direction: 'inbound' },
    ]
    expect(isNudgeEligible(BASE_PATIENT, messages, NOW)).toBe(false)
  })

  it('returns false when patient was active today', () => {
    const messages: Message[] = [
      { created_at: daysAgo(0), direction: 'inbound' },
    ]
    expect(isNudgeEligible(BASE_PATIENT, messages, NOW)).toBe(false)
  })

  it('returns false when patient has already been nudged in this inactive period', () => {
    const messages: Message[] = [
      { created_at: daysAgo(6), direction: 'inbound' },
      { created_at: daysAgo(3), direction: 'outbound', is_nudge: true },
    ]
    expect(isNudgeEligible(BASE_PATIENT, messages, NOW)).toBe(false)
  })

  it('returns true when patient was nudged, responded, then went inactive again', () => {
    const messages: Message[] = [
      { created_at: daysAgo(14), direction: 'inbound' },
      { created_at: daysAgo(10), direction: 'outbound', is_nudge: true },
      // Patient responded — new inbound resets the inactive clock
      { created_at: daysAgo(9), direction: 'inbound' },
      // Now inactive for 9 days with no new nudge
    ]
    expect(isNudgeEligible(BASE_PATIENT, messages, NOW)).toBe(true)
  })

  it('returns true when patient has no messages but account is older than 3 days', () => {
    const newPatient: Patient = { ...BASE_PATIENT, created_at: daysAgo(5) }
    expect(isNudgeEligible(newPatient, [], NOW)).toBe(true)
  })

  it('returns false when patient has no messages and account is less than 3 days old', () => {
    const newPatient: Patient = { ...BASE_PATIENT, created_at: daysAgo(1) }
    expect(isNudgeEligible(newPatient, [], NOW)).toBe(false)
  })

  it('returns false for opted-out patient regardless of inactivity', () => {
    const optedOut: Patient = { ...BASE_PATIENT, opted_out: true }
    const messages: Message[] = [
      { created_at: daysAgo(10), direction: 'inbound' },
    ]
    expect(isNudgeEligible(optedOut, messages, NOW)).toBe(false)
  })

  it('returns false for patient without consent', () => {
    const noConsent: Patient = { ...BASE_PATIENT, consent_given: false }
    const messages: Message[] = [
      { created_at: daysAgo(10), direction: 'inbound' },
    ]
    expect(isNudgeEligible(noConsent, messages, NOW)).toBe(false)
  })

  it('returns false for opted-out patient with no messages', () => {
    const optedOut: Patient = { ...BASE_PATIENT, opted_out: true, created_at: daysAgo(30) }
    expect(isNudgeEligible(optedOut, [], NOW)).toBe(false)
  })

  it('returns false for patient without consent and no messages', () => {
    const noConsent: Patient = { ...BASE_PATIENT, consent_given: false, created_at: daysAgo(30) }
    expect(isNudgeEligible(noConsent, [], NOW)).toBe(false)
  })

  it('does not count non-nudge outbound messages as blocking re-nudge', () => {
    const messages: Message[] = [
      { created_at: daysAgo(6), direction: 'inbound' },
      // Regular outbound reply — not a nudge
      { created_at: daysAgo(5), direction: 'outbound', is_nudge: false },
    ]
    expect(isNudgeEligible(BASE_PATIENT, messages, NOW)).toBe(true)
  })

  it('treats exactly 3 days inactive as eligible (boundary condition)', () => {
    const THREE_DAYS_AND_ONE_SECOND_MS = NOW - (3 * 24 * 60 * 60 * 1000) - 1000
    const messages: Message[] = [
      { created_at: new Date(THREE_DAYS_AND_ONE_SECOND_MS).toISOString(), direction: 'inbound' },
    ]
    expect(isNudgeEligible(BASE_PATIENT, messages, NOW)).toBe(true)
  })
})
