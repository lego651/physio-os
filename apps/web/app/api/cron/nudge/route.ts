import { generateText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { createAdminClient } from '@/lib/supabase/admin'
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

  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // Fetch all candidates: active, not opted out, have consented.
  // Per-patient message recency is evaluated below because the Supabase JS
  // client does not support correlated subqueries in .filter(). For a physio
  // clinic's patient volume (hundreds) this is acceptable.
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

  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()

  const nudgeResults = await Promise.allSettled(
    (candidatePatients ?? []).map(async (patient) => {
      // Skip if the patient sent a message within the last 3 days
      const { data: recentMessages } = await supabase
        .from('messages')
        .select('created_at')
        .eq('patient_id', patient.id)
        .eq('role', 'user')
        .gt('created_at', threeDaysAgo)
        .limit(1)

      if (recentMessages && recentMessages.length > 0) {
        return { patientId: patient.id, skipped: true }
      }

      // Get the timestamp of their most recent user message (null = no messages ever)
      const { data: lastMessages } = await supabase
        .from('messages')
        .select('created_at')
        .eq('patient_id', patient.id)
        .eq('role', 'user')
        .order('created_at', { ascending: false })
        .limit(1)

      const lastMessageAt = lastMessages?.[0]?.created_at ?? null

      // Skip if already nudged during this inactive period
      // (last_nudged_at >= last_message_at means the current inactive window is covered)
      if (patient.last_nudged_at && lastMessageAt && patient.last_nudged_at >= lastMessageAt) {
        return { patientId: patient.id, skipped: true }
      }

      // Edge case: never-messaged patients — only nudge if account is older than 3 days
      // and they haven't been nudged before
      if (!lastMessageAt) {
        const accountAgeDays =
          (Date.now() - new Date(patient.created_at as string).getTime()) / (1000 * 60 * 60 * 24)
        if (accountAgeDays < 3 || patient.last_nudged_at) {
          return { patientId: patient.id, skipped: true }
        }
      }

      // Fetch last recorded discomfort level from metrics
      const { data: lastMetric } = await supabase
        .from('metrics')
        .select('discomfort, pain_level')
        .eq('patient_id', patient.id)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      // Generate a personalized nudge via Claude
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

      // Send SMS
      await sendSMS({ to: patient.phone, body: nudgeText })

      // Record that this patient has been nudged
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
