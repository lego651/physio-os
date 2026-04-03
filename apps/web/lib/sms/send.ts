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
    throw new Error(`Twilio send failed (${response.status}): ${errorBody}`)
  }

  const result = await response.json() as { sid: string }
  return { sid: result.sid }
}

const GSM_SEGMENT_LIMIT = 160
const UCS2_SEGMENT_LIMIT = 70
const SMS_BUDGET_CHARS = 280
const SMS_TRUNCATE_LIMIT = 320

// GSM 03.38 basic character set detection
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
  const budget = isUCS2 ? UCS2_SEGMENT_LIMIT * 2 : SMS_BUDGET_CHARS
  const truncateAt = isUCS2 ? UCS2_SEGMENT_LIMIT * 2 : SMS_TRUNCATE_LIMIT

  if (text.length <= budget) return text
  if (text.length <= truncateAt && !isUCS2) return text

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
