import * as Sentry from '@sentry/nextjs'
import { verifyBearerToken } from '@/lib/auth/verify-bearer'
import { getCurrentMonthUsage } from '@/lib/sms/cost-tracker'

export const maxDuration = 30

const COST_THRESHOLD = 40 // dollars — matches ALERT_THRESHOLD in cost-tracker.ts

/**
 * GET /api/cron/sms-cost-alert
 *
 * Vercel Cron job that checks the current month's SMS spend.
 * If spend exceeds $40, it:
 *   1. Captures a Sentry event at "fatal" level so Sentry alert rules fire.
 *   2. Sends an email to ADMIN_EMAIL via Resend (requires RESEND_API_KEY).
 *
 * Schedule: daily at 09:00 UTC (see vercel.json).
 * Auth: Bearer CRON_SECRET (same pattern as other cron routes).
 */
export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error('[sms-cost-alert] Missing CRON_SECRET env var')
    return Response.json({ error: 'Server configuration error' }, { status: 500 })
  }

  if (!verifyBearerToken(req, cronSecret)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let usage: { month: string; segments: number; costEstimate: number }
  try {
    usage = await getCurrentMonthUsage()
  } catch (err) {
    console.error('[sms-cost-alert] Failed to fetch SMS usage:', err)
    Sentry.captureException(err, { tags: { cron: 'sms-cost-alert' } })
    return Response.json({ error: 'Failed to fetch usage' }, { status: 500 })
  }

  const { month, segments, costEstimate } = usage

  console.log(
    `[sms-cost-alert] Month=${month} segments=${segments} cost=$${costEstimate.toFixed(2)} threshold=$${COST_THRESHOLD}`,
  )

  if (costEstimate <= COST_THRESHOLD) {
    return Response.json({ alerted: false, month, costEstimate })
  }

  // ── Cost threshold exceeded ──────────────────────────────────────────────

  const alertMessage = `SMS cost alert: $${costEstimate.toFixed(2)} spent in ${month} (threshold: $${COST_THRESHOLD}). Segments sent: ${segments}.`
  console.error(`[sms-cost-alert] THRESHOLD EXCEEDED — ${alertMessage}`)

  // 1. Sentry event — configure a "fatal" alert rule in Sentry dashboard to email on this.
  Sentry.captureEvent({
    message: alertMessage,
    level: 'fatal',
    tags: {
      cron: 'sms-cost-alert',
      month,
    },
    extra: {
      costEstimate,
      segments,
      threshold: COST_THRESHOLD,
    },
  })

  // 2. Email via Resend (optional — degrades gracefully if RESEND_API_KEY is not set).
  const resendApiKey = process.env.RESEND_API_KEY
  const adminEmail = process.env.ADMIN_EMAIL

  if (resendApiKey && adminEmail) {
    try {
      await sendAlertEmail({ resendApiKey, adminEmail, month, costEstimate, segments })
      console.log(`[sms-cost-alert] Alert email sent to ${adminEmail}`)
    } catch (emailErr) {
      // Non-fatal: log and capture but don't fail the cron response.
      console.error('[sms-cost-alert] Failed to send alert email:', emailErr)
      Sentry.captureException(emailErr, { tags: { cron: 'sms-cost-alert', step: 'email' } })
    }
  } else {
    console.warn(
      '[sms-cost-alert] Skipping email alert — RESEND_API_KEY or ADMIN_EMAIL not configured',
    )
  }

  return Response.json({ alerted: true, month, costEstimate, segments })
}

// ── Email helper ─────────────────────────────────────────────────────────────

interface AlertEmailOptions {
  resendApiKey: string
  adminEmail: string
  month: string
  costEstimate: number
  segments: number
}

async function sendAlertEmail(opts: AlertEmailOptions): Promise<void> {
  const { resendApiKey, adminEmail, month, costEstimate, segments } = opts

  const subject = `[V-Health] SMS cost alert: $${costEstimate.toFixed(2)} in ${month}`
  const html = `
    <p>The monthly SMS cost threshold of <strong>$${COST_THRESHOLD}</strong> has been exceeded.</p>
    <table>
      <tr><td><strong>Month</strong></td><td>${month}</td></tr>
      <tr><td><strong>Segments sent</strong></td><td>${segments.toLocaleString()}</td></tr>
      <tr><td><strong>Estimated cost</strong></td><td>$${costEstimate.toFixed(2)}</td></tr>
      <tr><td><strong>Threshold</strong></td><td>$${COST_THRESHOLD}.00</td></tr>
    </table>
    <p>Review usage at <code>/api/admin/sms-usage</code> or in the Twilio console.</p>
  `.trim()

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'alerts@vhealth.ai',
      to: adminEmail,
      subject,
      html,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Resend API error (${res.status}): ${body}`)
  }
}
