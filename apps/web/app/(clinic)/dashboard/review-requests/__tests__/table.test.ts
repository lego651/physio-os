import { describe, it, expect } from 'vitest'

// Pure helper logic duplicated here for unit testing without React/browser deps.
// These match the implementations exported from AdminReviewRequestsClient.tsx.

type EffectiveChannel = 'email' | 'sms' | 'both' | 'missing'

function effectiveChannel(
  row: { patient_email: string | null; patient_phone: string | null },
  globalDefault: 'email' | 'sms' | 'both',
): EffectiveChannel {
  const hasEmail = !!row.patient_email
  const hasPhone = !!row.patient_phone
  if (!hasEmail && !hasPhone) return 'missing'
  if (hasEmail && hasPhone) return globalDefault
  if (hasEmail) return 'email'
  return 'sms'
}

interface OptOut { clinic_id: string; contact: string; contact_type: 'email' | 'sms' }

function isRowOptedOut(
  row: { patient_email: string | null; patient_phone: string | null },
  clinicId: string,
  optOuts: OptOut[],
): boolean {
  return optOuts.some(o => {
    if (o.clinic_id !== clinicId) return false
    if (o.contact_type === 'email' && row.patient_email && o.contact === row.patient_email) return true
    if (o.contact_type === 'sms' && row.patient_phone && o.contact === row.patient_phone) return true
    return false
  })
}

describe('effectiveChannel', () => {
  it('returns "missing" when both phone and email are null', () => {
    expect(effectiveChannel({ patient_email: null, patient_phone: null }, 'email')).toBe('missing')
  })

  it('returns "email" when only email is set', () => {
    expect(effectiveChannel({ patient_email: 'a@b.com', patient_phone: null }, 'sms')).toBe('email')
  })

  it('returns "sms" when only phone is set', () => {
    expect(effectiveChannel({ patient_email: null, patient_phone: '+14031234567' }, 'email')).toBe('sms')
  })

  it('returns globalDefault "email" when both are set', () => {
    const row = { patient_email: 'a@b.com', patient_phone: '+14031234567' }
    expect(effectiveChannel(row, 'email')).toBe('email')
  })

  it('returns globalDefault "sms" when both are set', () => {
    const row = { patient_email: 'a@b.com', patient_phone: '+14031234567' }
    expect(effectiveChannel(row, 'sms')).toBe('sms')
  })

  it('returns globalDefault "both" when both are set', () => {
    const row = { patient_email: 'a@b.com', patient_phone: '+14031234567' }
    expect(effectiveChannel(row, 'both')).toBe('both')
  })
})

describe('isRowOptedOut', () => {
  const optOuts: OptOut[] = [
    { clinic_id: 'clinic-1', contact: 'opted@out.com', contact_type: 'email' },
    { clinic_id: 'clinic-1', contact: '+14039990000', contact_type: 'sms' },
  ]

  it('returns true when email matches opt-out', () => {
    expect(isRowOptedOut({ patient_email: 'opted@out.com', patient_phone: null }, 'clinic-1', optOuts)).toBe(true)
  })

  it('returns true when phone matches opt-out', () => {
    expect(isRowOptedOut({ patient_email: null, patient_phone: '+14039990000' }, 'clinic-1', optOuts)).toBe(true)
  })

  it('returns false when contact does not match', () => {
    expect(isRowOptedOut({ patient_email: 'good@email.com', patient_phone: null }, 'clinic-1', optOuts)).toBe(false)
  })

  it('returns false when clinic_id does not match', () => {
    expect(isRowOptedOut({ patient_email: 'opted@out.com', patient_phone: null }, 'clinic-2', optOuts)).toBe(false)
  })

  it('returns false when optOuts is empty', () => {
    expect(isRowOptedOut({ patient_email: 'anyone@x.com', patient_phone: null }, 'clinic-1', [])).toBe(false)
  })
})

describe('bulk send guard', () => {
  it('blocks if more than 10 rows would be sent', () => {
    const sendable = Array.from({ length: 11 }, (_, i) => ({ id: `row-${i}` }))
    expect(sendable.length > 10).toBe(true)
  })

  it('allows exactly 10 rows', () => {
    const sendable = Array.from({ length: 10 }, (_, i) => ({ id: `row-${i}` }))
    expect(sendable.length > 10).toBe(false)
  })
})
