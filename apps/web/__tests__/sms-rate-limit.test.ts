import { describe, it, expect } from 'vitest'
import { checkRateLimit } from '../lib/sms/rate-limit'

describe('checkRateLimit', () => {
  it('allows first request', () => {
    expect(checkRateLimit('+16045550001')).toBe(true)
  })

  it('allows up to 10 requests from same phone', () => {
    const phone = '+16045550002'
    for (let i = 0; i < 10; i++) {
      expect(checkRateLimit(phone)).toBe(true)
    }
  })

  it('blocks 11th request from same phone', () => {
    const phone = '+16045550003'
    for (let i = 0; i < 10; i++) {
      checkRateLimit(phone)
    }
    expect(checkRateLimit(phone)).toBe(false)
  })

  it('does not affect different phone numbers', () => {
    const phone1 = '+16045550004'
    const phone2 = '+16045550005'
    for (let i = 0; i < 10; i++) {
      checkRateLimit(phone1)
    }
    // phone1 is rate limited
    expect(checkRateLimit(phone1)).toBe(false)
    // phone2 is not
    expect(checkRateLimit(phone2)).toBe(true)
  })
})
