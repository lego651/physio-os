import { describe, it, expect, beforeEach } from 'vitest'
import { loadReviewConfig } from '../config'

describe('loadReviewConfig', () => {
  const ENV_KEYS = [
    'REVIEW_TOKEN_SECRET',
    'REVIEW_BASE_URL',
    'REVIEW_TEST_MODE',
    'REVIEW_TEST_RECIPIENT_EMAIL',
    'REVIEW_TEST_RECIPIENT_PHONE',
    'RESEND_WEBHOOK_SECRET',
  ] as const

  beforeEach(() => {
    for (const key of ENV_KEYS) delete process.env[key]
  })

  it('throws when REVIEW_TOKEN_SECRET is missing', () => {
    process.env.REVIEW_BASE_URL = 'https://x'
    expect(() => loadReviewConfig()).toThrow(/REVIEW_TOKEN_SECRET/)
  })

  it('throws when REVIEW_TOKEN_SECRET is shorter than 32 chars', () => {
    process.env.REVIEW_TOKEN_SECRET = 'short'
    process.env.REVIEW_BASE_URL = 'https://x'
    expect(() => loadReviewConfig()).toThrow(/at least 32/)
  })

  it('returns testMode=true and requires test recipients when REVIEW_TEST_MODE=true', () => {
    process.env.REVIEW_TOKEN_SECRET = 'a'.repeat(32)
    process.env.REVIEW_BASE_URL = 'https://x'
    process.env.REVIEW_TEST_MODE = 'true'
    expect(() => loadReviewConfig()).toThrow(/REVIEW_TEST_RECIPIENT_EMAIL/)
  })

  it('loads a fully configured production env', () => {
    process.env.REVIEW_TOKEN_SECRET = 'a'.repeat(32)
    process.env.REVIEW_BASE_URL = 'https://physio.app'
    process.env.RESEND_WEBHOOK_SECRET = 'whsec_x'
    const cfg = loadReviewConfig()
    expect(cfg.testMode).toBe(false)
    expect(cfg.baseUrl).toBe('https://physio.app')
    expect(cfg.tokenSecret.length).toBeGreaterThanOrEqual(32)
    expect(cfg.resendWebhookSecret).toBe('whsec_x')
  })
})
