import { generateText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyBearerToken } from '@/lib/auth/verify-bearer'
import { sendSMS } from '@/lib/sms/send'
import type { PatientProfile } from '@physio-os/shared'

export const maxDuration = 60

const NUDGE_MAX_TOKENS = 100
const NUDGE_CHAR_LIMIT = 160
const DEFAULT_MODEL = 'claude-sonnet-4.5'

/** Vercel Cron calls GET. Authorization is checked via Bearer token. */
export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error('[nudge-cron] Missing CRON_SECRET env var')
    return Response.json({ error: 'Server configuration error' }, { status: 500 })
  }

  if (!verifyBearerToken(req, cronSecret)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // ── 1. Fetch candidates ──
  const { data: candidatePatients, error: fetchError } = await supabase
    .from('patients')
    .select('id, phone, name, profile, language, created_at, last_nudged_at')
    .eq('active', true)
    .eq('opted_out', false)
    .not('consent_at', 'is', null)

  if (fetchError) {
    console.error('[nudge-cron] Failed to fetch patients:', fetchError.message)
    return Response.json({ error: 'Database error' }, { status: 500 })
  }

  if (!candidatePatients || candidatePatients.length === 0) {
    return Response.json({ nudgesSent: 0, failed: 0 })
  }

  const patientIds = candidatePatients.map((p) => p.id)
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()

  // ── 2. Batch-fetch last user message per patient (eliminates 2N queries) ──
  const { data: messageRows } = await supabase
    .from('messages')
    .select('patient_id, created_at')
    .eq('role', 'user')
    .in('patient_id', patientIds)
    .order('created_at', { ascending: false })

  // Build lookup: patient_id → most recent user message timestamp
  const lastMessageByPatient = new Map<string, string>()
  for (const row of messageRows ?? []) {
    if (!lastMessageByPatient.has(row.patient_id)) {
      lastMessageByPatient.set(row.patient_id, row.created_at)
    }
  }

  // ── 3. Batch-fetch latest metric per patient (eliminates N queries) ──
  const { data: metricRows } = await supabase
    .from('metrics')
    .select('patient_id, discomfort, pain_level, recorded_at')
    .in('patient_id', patientIds)
    .order('recorded_at', { ascending: false })

  const lastMetricByPatient = new Map<string, { discomfort: number | null; pain_level: number | null }>()
  for (const row of metricRows ?? []) {
    if (!lastMetricByPatient.has(row.patient_id)) {
      lastMetricByPatient.set(row.patient_id, { discomfort: row.discomfort, pain_level: row.pain_level })
    }
  }

  // ── 4. Filter eligible patients in-memory ──
  const eligiblePatients = candidatePatients.filter((patient) => {
    const lastMessageAt = lastMessageByPatient.get(patient.id) ?? null

    // Skip if recent message within 3 days
    if (lastMessageAt && lastMessageAt > threeDaysAgo) return false

    // Skip if already nudged during this inactive period
    if (patient.last_nudged_at && lastMessageAt && patient.last_nudged_at >= lastMessageAt) return false

    // Never-messaged patients: only nudge if account > 3 days old and not already nudged
    if (!lastMessageAt) {
      const accountAgeDays =
        (Date.now() - new Date(patient.created_at as string).getTime()) / (1000 * 60 * 60 * 24)
      if (accountAgeDays < 3 || patient.last_nudged_at) return false
    }

    return true
  })

  // ── 5. Send nudges ──
  const nudgeResults = await Promise.allSettled(
    eligiblePatients.map(async (patient) => {
      const lastMetric = lastMetricByPatient.get(patient.id)
      const profile = (patient.profile ?? {}) as PatientProfile
      const condition = profile.injury ?? profile.diagnosis ?? 'their condition'
      const lastDiscomfort =
        lastMetric?.discomfort != null
          ? `${lastMetric.discomfort}/3`
          : lastMetric?.pain_level != null
            ? `${lastMetric.pain_level}/10`
            : 'unknown'

      let nudgeText: string
      try {
        const { text } = await generateText({
          model: anthropic(process.env.AI_MODEL ?? DEFAULT_MODEL),
          prompt: `Generate a brief, warm check-in message for ${patient.name} who has ${condition}. Last known discomfort was ${lastDiscomfort}. Keep under 160 characters. Do not include any medical advice.`,
          maxOutputTokens: NUDGE_MAX_TOKENS,
        })
        nudgeText = text.trim().slice(0, NUDGE_CHAR_LIMIT)
      } catch (aiError) {
        console.error('[nudge-cron] AI generation failed for patient:', patient.id, aiError)
        throw aiError
      }

      await sendSMS({ to: patient.phone, body: nudgeText })

      const { error: updateError } = await supabase
        .from('patients')
        .update({ last_nudged_at: new Date().toISOString() })
        .eq('id', patient.id)

      if (updateError) {
        console.error('[nudge-cron] Failed to update last_nudged_at for patient:', patient.id)
      }

      console.log('[nudge-cron] Nudge sent:', { patientId: patient.id })
      return { patientId: patient.id, nudged: true }
    }),
  )

  const sent = nudgeResults.filter(
    (r) => r.status === 'fulfilled' && (r.value as { nudged?: boolean }).nudged,
  ).length

  const failed = nudgeResults.filter((r) => r.status === 'rejected').length

  if (failed > 0) {
    console.error(`[nudge-cron] ${failed} nudge(s) failed`)
  }

  return Response.json({ nudgesSent: sent, failed })
}
