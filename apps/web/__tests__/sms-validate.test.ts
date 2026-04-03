import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { validateTwilioSignature } from '../lib/sms/validate'

const AUTH_TOKEN = 'test-auth-token-12345'
const WEBHOOK_URL = 'https://example.ngrok.io/api/sms'

/** Generate a valid Twilio signature for testing */
function sign(url: string, params: Record<string, string>): string {
  const sortedKeys = Object.keys(params).sort()
  let data = url
  for (const key of sortedKeys) {
    data += key + params[key]
  }
  return createHmac('sha1', AUTH_TOKEN).update(data, 'utf-8').digest('base64')
}

describe('validateTwilioSignature', () => {
  const params = {
    Body: 'Hello',
    From: '+16041234567',
    MessageSid: 'SM1234567890',
    NumMedia: '0',
  }

  it('accepts a valid signature', () => {
    const sig = sign(WEBHOOK_URL, params)
    expect(validateTwilioSignature(AUTH_TOKEN, sig, WEBHOOK_URL, params)).toBe(true)
  })

  it('rejects an invalid signature', () => {
    expect(validateTwilioSignature(AUTH_TOKEN, 'invalid-sig', WEBHOOK_URL, params)).toBe(false)
  })

  it('rejects when auth token is wrong', () => {
    const sig = sign(WEBHOOK_URL, params)
    expect(validateTwilioSignature('wrong-token', sig, WEBHOOK_URL, params)).toBe(false)
  })

  it('rejects when URL differs', () => {
    const sig = sign(WEBHOOK_URL, params)
    expect(validateTwilioSignature(AUTH_TOKEN, sig, 'https://other.com/api/sms', params)).toBe(false)
  })

  it('rejects when params are tampered', () => {
    const sig = sign(WEBHOOK_URL, params)
    const tampered = { ...params, Body: 'Tampered' }
    expect(validateTwilioSignature(AUTH_TOKEN, sig, WEBHOOK_URL, tampered)).toBe(false)
  })

  it('handles empty params', () => {
    const sig = sign(WEBHOOK_URL, {})
    expect(validateTwilioSignature(AUTH_TOKEN, sig, WEBHOOK_URL, {})).toBe(true)
  })

  it('handles params with special characters', () => {
    const specialParams = { Body: 'Hello 你好! 🎉', From: '+16041234567' }
    const sig = sign(WEBHOOK_URL, specialParams)
    expect(validateTwilioSignature(AUTH_TOKEN, sig, WEBHOOK_URL, specialParams)).toBe(true)
  })
})
