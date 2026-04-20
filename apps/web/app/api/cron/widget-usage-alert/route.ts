import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyBearerToken } from '@/lib/auth/verify-bearer'

export const maxDuration = 30

/**
 * GET /api/cron/widget-usage-alert
 *
 * Vercel Cron job that sums today's widget_usage spend across all clinics.
 * If total spend exceeds WIDGET_DAILY_SPEND_ALERT_USD (default $2), it sends
 * an email to ADMIN_EMAIL via Resend.
 *
 * Schedule: daily at 13:00 UTC (≈ 9am America/Edmonton in summer DST).
 * Auth: Bearer CRON_SECRET.
 */
export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error('[widget-usage-alert] Missing CRON_SECRET env var')
    return Response.json({ error: 'Server configuration error' }, { status: 500 })
  }

  if (!verifyBearerToken(req, cronSecret)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const today = new Date().toISOString().slice(0, 10)

  const { data, error } = await supabase
    .from('widget_usage')
    .select('estimated_cost_usd')
    .eq('date', today)

  if (error) {
    console.error('[widget-usage-alert] Failed to fetch widget_usage:', error)
    return Response.json({ error: 'Failed to fetch usage' }, { status: 500 })
  }

  const totalToday = (data ?? []).reduce(
    (sum, r) => sum + Number(r.estimated_cost_usd ?? 0),
    0,
  )
  const threshold = Number(process.env.WIDGET_DAILY_SPEND_ALERT_USD ?? '2')

  console.log(
    `[widget-usage-alert] date=${today} totalToday=$${totalToday.toFixed(4)} threshold=$${threshold}`,
  )

  let alerted = false
  if (totalToday >= threshold) {
    const key = process.env.RESEND_API_KEY
    const to = process.env.ADMIN_EMAIL
    if (key && to) {
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'Widget alert <onboarding@resend.dev>',
            to,
            subject: `[widget] daily spend $${totalToday.toFixed(2)} exceeded $${threshold}`,
            html: `<p>Today's widget spend is <strong>$${totalToday.toFixed(2)}</strong>. Consider inspecting the Anthropic console and maybe toggling <code>WIDGET_ENABLED=false</code>.</p>`,
          }),
        })
        if (!res.ok) {
          const body = await res.text()
          console.error(
            `[widget-usage-alert] Resend API error (${res.status}): ${body}`,
          )
        } else {
          alerted = true
          console.log(`[widget-usage-alert] Alert email sent to ${to}`)
        }
      } catch (emailErr) {
        console.error('[widget-usage-alert] Failed to send alert email:', emailErr)
      }
    } else {
      console.warn(
        '[widget-usage-alert] Skipping email alert — RESEND_API_KEY or ADMIN_EMAIL not configured',
      )
    }
  }

  return NextResponse.json({ date: today, totalToday, threshold, alerted })
}
