// apps/web/lib/review/config.ts
//
// Single source of truth for S2 review engine configuration.
// Throws at module load time if required env vars are missing,
// so a misconfigured deploy fails fast on first request.

export interface ReviewConfig {
  tokenSecret: string
  baseUrl: string
  testMode: boolean
  testRecipientEmail: string | null
  testRecipientPhone: string | null
  resendWebhookSecret: string
}

export function loadReviewConfig(): ReviewConfig {
  const tokenSecret = process.env.REVIEW_TOKEN_SECRET
  if (!tokenSecret) throw new Error('Missing REVIEW_TOKEN_SECRET')
  if (tokenSecret.length < 32) throw new Error('REVIEW_TOKEN_SECRET must be at least 32 chars')

  const baseUrl = process.env.REVIEW_BASE_URL
  if (!baseUrl) throw new Error('Missing REVIEW_BASE_URL')

  const testMode = process.env.REVIEW_TEST_MODE === 'true'
  const testRecipientEmail = process.env.REVIEW_TEST_RECIPIENT_EMAIL ?? null
  const testRecipientPhone = process.env.REVIEW_TEST_RECIPIENT_PHONE ?? null

  if (testMode && !testRecipientEmail) {
    throw new Error('REVIEW_TEST_RECIPIENT_EMAIL required when REVIEW_TEST_MODE=true')
  }
  if (testMode && !testRecipientPhone) {
    throw new Error('REVIEW_TEST_RECIPIENT_PHONE required when REVIEW_TEST_MODE=true')
  }

  const resendWebhookSecret = process.env.RESEND_WEBHOOK_SECRET ?? ''

  return { tokenSecret, baseUrl, testMode, testRecipientEmail, testRecipientPhone, resendWebhookSecret }
}
