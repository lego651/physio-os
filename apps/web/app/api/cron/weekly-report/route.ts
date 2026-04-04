import { createAdminClient } from '@/lib/supabase/admin'
import { verifyBearerToken } from '@/lib/auth/verify-bearer'
import { sendSMS } from '@/lib/sms/send'
import { generateWeeklyReport } from '@physio-os/ai-core'

// Allow enough time for AI generation across all patients
export const maxDuration = 300

const AI_CONCURRENCY = 5

// CASL requires sender identification and opt-out instructions in every outbound message.
const STOP_FOOTER_EN = ' Reply STOP to unsubscribe.'
const STOP_FOOTER_ZH = ' 回复STOP退订。'

// Effective body limits after reserving space for the mandatory footers
const SMS_SEGMENT_LIMIT_GSM = 160 - STOP_FOOTER_EN.length // ~133 chars for content
const SMS_SEGMENT_LIMIT_UCS2 = 70 - STOP_FOOTER_ZH.length // ~62 chars for content

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

function isAuthorized(req: Request): boolean {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error('[weekly-report] CRON_SECRET is not set')
    return false
  }
  return verifyBearerToken(req, cronSecret)
}

import { getWeekStartUTC as getWeekStart } from '@/lib/date'

// ---------------------------------------------------------------------------
// SMS formatting
// ---------------------------------------------------------------------------

interface Patient {
  id: string
  phone: string
  name: string | null
  language: string | null
}

/**
 * Build a report-ready SMS for the given patient.
 * Respects per-encoding segment limits:
 *   - Chinese (UCS-2): 70 chars
 *   - English (GSM):  160 chars
 */
function buildSMSText(patient: Patient, avgDiscomfort: number | null, reportUrl: string): string {
  const name = patient.name ?? 'there'
  const avg = avgDiscomfort != null ? avgDiscomfort.toFixed(1) : 'N/A'
  const isZh = patient.language === 'zh'

  if (isZh) {
    // UCS-2: 70 chars per segment. Reserve chars for STOP_FOOTER_ZH.
    const body = (text: string) => text + STOP_FOOTER_ZH

    const full = `嗨${name}，您的周报已生成！不适感均值：${avg}/3。查看：${reportUrl}`
    if (full.length <= SMS_SEGMENT_LIMIT_UCS2) return body(full)

    // If too long (name or URL), shorten the name to first char
    const shortName = name.length > 1 ? name[0] : name
    const shortened = `嗨${shortName}，您的周报已生成！不适感均值：${avg}/3。查看：${reportUrl}`
    if (shortened.length <= SMS_SEGMENT_LIMIT_UCS2) return body(shortened)

    // Last resort: omit name entirely
    const noName = `您的周报已生成！不适感均值：${avg}/3。查看：${reportUrl}`
    return body(noName.slice(0, SMS_SEGMENT_LIMIT_UCS2))
  }

  // GSM: reserve chars for STOP_FOOTER_EN.
  const body = (text: string) => text + STOP_FOOTER_EN

  const full = `Hi ${name}, your weekly recovery report is ready! Discomfort avg: ${avg}/3. View: ${reportUrl}`
  if (full.length <= SMS_SEGMENT_LIMIT_GSM) return body(full)

  // Shorten name to first name if multi-word
  const firstName = name.split(' ')[0]
  const withFirstName = `Hi ${firstName}, your weekly recovery report is ready! Discomfort avg: ${avg}/3. View: ${reportUrl}`
  if (withFirstName.length <= SMS_SEGMENT_LIMIT_GSM) return body(withFirstName)

  // Drop name entirely
  const noName = `Your weekly recovery report is ready! Discomfort avg: ${avg}/3. View: ${reportUrl}`
  if (noName.length <= SMS_SEGMENT_LIMIT_GSM) return body(noName)

  // Final fallback: truncate at content limit (URL is load-bearing, truncate from middle)
  return body(noName.slice(0, SMS_SEGMENT_LIMIT_GSM))
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!appUrl) {
    console.error('[weekly-report] NEXT_PUBLIC_APP_URL is not set')
    return Response.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const supabase = createAdminClient()

  // Cron runs Sunday at 17:00 UTC; report the Mon–Sun week that just ended.
  const weekStart = getWeekStart(new Date())
  const weekStartISO = weekStart.toISOString()

  console.log(`[weekly-report] Running for week starting ${weekStart.toISOString().slice(0, 10)}`)

  // Query eligible patients: active, not opted out, with >= 1 metric in the past 7 days
  const { data: patients, error: patientsError } = await supabase
    .from('patients')
    .select('id, phone, name, language')
    .eq('active', true)
    .eq('opted_out', false)

  if (patientsError) {
    console.error('[weekly-report] Failed to query patients', patientsError)
    return Response.json({ error: 'Database error' }, { status: 500 })
  }

  if (!patients || patients.length === 0) {
    return Response.json({ reportsGenerated: 0, smsSent: 0 })
  }

  // Filter to patients with at least 1 metric in the week window
  const { data: activePatientIds, error: metricsFilterError } = await supabase
    .from('metrics')
    .select('patient_id')
    .gte('recorded_at', weekStartISO)
    .in('patient_id', patients.map((p) => p.id))

  if (metricsFilterError) {
    console.error('[weekly-report] Failed to filter patients by metrics', metricsFilterError)
    return Response.json({ error: 'Database error' }, { status: 500 })
  }

  const eligibleIds = new Set((activePatientIds ?? []).map((r) => r.patient_id))
  const eligiblePatients = patients.filter((p) => eligibleIds.has(p.id))

  console.log(`[weekly-report] ${eligiblePatients.length} eligible patient(s)`)

  // Process patients in batches to avoid hitting Anthropic rate limits.
  // Each generateWeeklyReport call may trigger 1-2 Claude calls (report + pattern detection).
  let reportsGenerated = 0
  let smsSent = 0
  let failures = 0

  for (let i = 0; i < eligiblePatients.length; i += AI_CONCURRENCY) {
    const batch = eligiblePatients.slice(i, i + AI_CONCURRENCY)
    const results = await Promise.allSettled(
      batch.map(async (patient) => {
        const report = await generateWeeklyReport(patient.id, weekStart, supabase)

        if (!report) {
          console.log(`[weekly-report] Skipping patient ${patient.id} — no data points`)
          return { patientId: patient.id, skipped: true }
        }

        const reportUrl = `${appUrl}/report/${report.token}`
        const avgDiscomfort = (report.metrics_summary as { avgDiscomfort?: number | null } | null)
          ?.avgDiscomfort ?? null

        const smsText = buildSMSText(patient as Patient, avgDiscomfort, reportUrl)

        await sendSMS({ to: patient.phone, body: smsText })

        // Persist audit record (required for CASL compliance logging)
        await supabase.from('messages').insert({
          patient_id: patient.id,
          role: 'assistant',
          content: smsText,
          channel: 'sms',
        }).then(({ error }) => {
          if (error) console.error('[weekly-report] Failed to save SMS audit record for patient:', patient.id, error)
        })

        console.log(`[weekly-report] SMS sent to patient ${patient.id}`)
        return { patientId: patient.id, skipped: false }
      }),
    )

    for (const result of results) {
      if (result.status === 'fulfilled') {
        if (!result.value.skipped) {
          reportsGenerated++
          smsSent++
        }
      } else {
        failures++
        console.error('[weekly-report] Patient processing failed', result.reason)
      }
    }
  }

  console.log(
    `[weekly-report] Done. reports=${reportsGenerated} sms=${smsSent} failures=${failures}`,
  )

  return Response.json({ reportsGenerated, smsSent, failures })
}
