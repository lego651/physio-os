import * as Sentry from '@sentry/nextjs'

const RESEND_API_URL = 'https://api.resend.com/emails'

export interface EmergencyAlertParams {
  patientName: string | null
  patientPhone: string
  triggeringMessage: string
  timestamp: string
  channel: 'web' | 'sms'
}

/**
 * Send an emergency alert email to the admin.
 *
 * Uses the Resend API via fetch (no SDK dependency — consistent with send.ts pattern).
 * Failure is non-blocking: errors are logged to Sentry and swallowed so that the
 * patient response is never delayed.
 */
export async function sendEmergencyAlert(params: EmergencyAlertParams): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const adminEmail = process.env.ADMIN_EMAIL
  const clinicName = process.env.CLINIC_NAME || 'V-Health'

  if (!apiKey || !adminEmail) {
    // Log as a warning — missing config is an operational issue, not a crash
    console.warn('[emergency-alert] Skipping email: RESEND_API_KEY or ADMIN_EMAIL not configured')
    return
  }

  const { patientName, patientPhone, triggeringMessage, timestamp, channel } = params

  const displayName = patientName || '(unknown)'
  const channelLabel = channel === 'sms' ? 'SMS' : 'Web Chat'

  const html = `
<p><strong>A patient may require immediate assistance.</strong></p>
<table cellpadding="6" cellspacing="0" style="border-collapse:collapse;">
  <tr>
    <td style="font-weight:bold;padding-right:16px;">Patient name</td>
    <td>${htmlEscape(displayName)}</td>
  </tr>
  <tr>
    <td style="font-weight:bold;padding-right:16px;">Phone</td>
    <td>${htmlEscape(patientPhone)}</td>
  </tr>
  <tr>
    <td style="font-weight:bold;padding-right:16px;">Channel</td>
    <td>${channelLabel}</td>
  </tr>
  <tr>
    <td style="font-weight:bold;padding-right:16px;">Time (UTC)</td>
    <td>${htmlEscape(timestamp)}</td>
  </tr>
</table>
<p><strong>Triggering message:</strong></p>
<blockquote style="border-left:4px solid #e00;padding-left:12px;color:#333;">
  ${htmlEscape(triggeringMessage)}
</blockquote>
<hr/>
<p style="color:#666;font-size:12px;">
  This alert was generated automatically by ${htmlEscape(clinicName)} Recovery Coach.
  Please follow your clinic's emergency protocol.
</p>
`

  const text = [
    'EMERGENCY ALERT — Patient may require immediate assistance',
    '',
    `Patient name : ${displayName}`,
    `Phone        : ${patientPhone}`,
    `Channel      : ${channelLabel}`,
    `Time (UTC)   : ${timestamp}`,
    '',
    'Triggering message:',
    triggeringMessage,
    '',
    `-- ${clinicName} Recovery Coach`,
  ].join('\n')

  try {
    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${clinicName} Alerts <alerts@vhealth.ai>`,
        to: [adminEmail],
        subject: `\u26A0\uFE0F ${clinicName} Recovery Coach \u2014 Patient Emergency Alert`,
        html,
        text,
      }),
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`Resend API error ${response.status}: ${body}`)
    }
  } catch (err) {
    // Log to Sentry but do NOT rethrow — patient response must not be blocked
    Sentry.captureException(err, {
      level: 'warning',
      tags: { component: 'emergency-alert-email' },
      extra: {
        patientPhone,
        channel,
        timestamp,
      },
    })
    console.error('[emergency-alert] Failed to send admin email:', err)
  }
}

function htmlEscape(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
