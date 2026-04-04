import { trackSMSUsage } from '@/lib/sms/cost-tracker'

const TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01'

interface SendSMSOptions {
  to: string
  body: string
  mediaUrls?: string[]
}

/**
 * Send SMS via Twilio REST API.
 * Uses fetch (no twilio SDK dependency) for lightweight deployment.
 */
export async function sendSMS(options: SendSMSOptions): Promise<{ sid: string }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_PHONE_NUMBER

  if (!accountSid || !authToken || !from) {
    throw new Error('Missing Twilio configuration (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER)')
  }

  const formData = new URLSearchParams()
  formData.append('To', options.to)
  formData.append('From', from)
  formData.append('Body', options.body)

  if (options.mediaUrls) {
    for (const url of options.mediaUrls) {
      formData.append('MediaUrl', url)
    }
  }

  const url = `${TWILIO_API_BASE}/Accounts/${accountSid}/Messages.json`
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64')

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formData.toString(),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    const err = new TwilioSendError(response.status, errorBody)
    // Only retry on 429 (rate limit) or 5xx (server errors)
    if (response.status !== 429 && response.status < 500) throw err
    throw err
  }

  const result = await response.json() as { sid: string; num_segments: string }

  // Fire-and-forget: track usage without blocking the caller.
  const segments = parseInt(result.num_segments ?? '1', 10)
  void trackSMSUsage(segments).catch((err: unknown) => {
    console.error('[sendSMS] cost tracking failed:', err)
  })

  return { sid: result.sid }
}

class TwilioSendError extends Error {
  constructor(public readonly statusCode: number, body: string) {
    super(`Twilio send failed (${statusCode}): ${body}`)
    this.name = 'TwilioSendError'
  }
  get retryable() { return this.statusCode === 429 || this.statusCode >= 500 }
}

/**
 * Send SMS with exponential backoff retry.
 * Only retries on 429 or 5xx; 4xx client errors fail immediately.
 */
export async function sendSMSWithRetry(options: SendSMSOptions, maxAttempts = 3): Promise<{ sid: string }> {
  const delays = [1000, 2000, 4000]
  let lastError: Error | undefined
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await sendSMS(options)
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (err instanceof TwilioSendError && !err.retryable) throw err
      if (attempt < maxAttempts - 1) {
        await new Promise(r => setTimeout(r, delays[attempt]))
      }
    }
  }
  throw lastError
}

const UCS2_SEGMENT_LIMIT = 70
const SMS_TRUNCATE_LIMIT = 320

// GSM 03.38 basic character set detection (approximate).
// The range \u00A0-\u00FF includes a few non-GSM chars (e.g., \u00B9 superscript 1, \u00B8 cedilla)
// but the impact is minimal — worst case a message gets classified as GSM when it should be UCS-2,
// resulting in a slightly wrong segment budget. Precise detection would require an explicit 128-char Set.
const NON_GSM_PATTERN = /[^\u0020-\u007E\u00A0-\u00FF\u0391-\u03C9\u20AC\n\r]/

/**
 * Check if text requires UCS-2 encoding (non-GSM characters like Chinese).
 */
export function requiresUCS2(text: string): boolean {
  return NON_GSM_PATTERN.test(text)
}

/**
 * Format AI response for SMS delivery.
 * - Under 280 chars: send as-is
 * - Over 320 chars: truncate at last sentence boundary + append web link
 * - Handles UCS-2 encoding budget for Chinese text
 */
export function formatSMSResponse(text: string, appUrl: string = 'https://vhealth.ai'): string {
  const isUCS2 = requiresUCS2(text)
  const truncateAt = isUCS2 ? UCS2_SEGMENT_LIMIT * 2 : SMS_TRUNCATE_LIMIT

  // Under truncateAt = 1-2 GSM segments (ASCII 320 chars, UCS-2 140 chars) — send as-is.
  // Over truncateAt = truncate at sentence boundary and append web link.
  if (text.length <= truncateAt) return text

  const suffix = `\n\nMore: ${appUrl}/chat`
  const maxContent = truncateAt - suffix.length

  // Truncate at last sentence boundary
  const truncated = text.slice(0, maxContent)
  const lastSentenceEnd = Math.max(
    truncated.lastIndexOf('. '),
    truncated.lastIndexOf('! '),
    truncated.lastIndexOf('? '),
    truncated.lastIndexOf('。'),
    truncated.lastIndexOf('！'),
    truncated.lastIndexOf('？'),
  )

  if (lastSentenceEnd > maxContent * 0.5) {
    return truncated.slice(0, lastSentenceEnd + 1) + suffix
  }

  // Fall back to last word boundary
  const lastSpace = truncated.lastIndexOf(' ')
  if (lastSpace > maxContent * 0.5) {
    return truncated.slice(0, lastSpace) + suffix
  }

  return truncated + suffix
}
