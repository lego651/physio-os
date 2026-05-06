import * as Sentry from '@sentry/nextjs'
import type { Database } from '@physio-os/shared'
import type { AdminClient } from '@/lib/supabase/admin'
import { handleMessage, createLogMetricsTool, createGetHistoryTool } from '@physio-os/ai-core'
import { buildContext } from '@physio-os/ai-core'
import { sendSMSWithRetry, formatSMSResponse } from './send'
import { processMMSMedia } from './mms'
import { handleSMSOnboarding } from './onboarding'
import { sendEmergencyAlert } from '@/lib/email/send-emergency-alert'

// In-memory failure tracker for the Sentry alert threshold.
// Keys: patientId -> array of failure timestamps (ms).
// This is intentionally in-process; for multi-instance deployments a
// persistent store (Redis / Supabase) would be needed.
const aiFailureLog = new Map<string, number[]>()
const AI_FAILURE_WINDOW_MS = 60 * 60 * 1000 // 1 hour
const AI_FAILURE_THRESHOLD = 3

/**
 * Record an AI failure for a patient and trigger a Sentry alert if
 * the patient has hit AI_FAILURE_THRESHOLD failures within the window.
 */
function recordAIFailure(patientId: string, error: unknown): void {
  const now = Date.now()
  const windowStart = now - AI_FAILURE_WINDOW_MS
  const timestamps = (aiFailureLog.get(patientId) ?? []).filter(t => t > windowStart)
  timestamps.push(now)
  aiFailureLog.set(patientId, timestamps)

  if (timestamps.length >= AI_FAILURE_THRESHOLD) {
    Sentry.captureException(error instanceof Error ? error : new Error(String(error)), {
      level: 'error',
      tags: { component: 'ai-sms', alert: 'repeated-failure' },
      extra: { patientId, failuresInWindow: timestamps.length },
    })
  }
}

type PatientRow = Database['public']['Tables']['patients']['Row']
type PatientSMS = Pick<
  PatientRow,
  'id' | 'name' | 'language' | 'phone' | 'practitioner_name' | 'profile' | 'consent_at' | 'opted_out' | 'clinic_id'
>

export const PATIENT_SMS_SELECT =
  'id, name, language, phone, practitioner_name, profile, consent_at, opted_out, clinic_id' as const

export interface ProcessMessageParams {
  supabase: AdminClient
  patient: PatientSMS | null
  normalizedPhone: string
  body: string
  messageSid: string
  numMedia: number
  params: Record<string, string>
  isNewPatient: boolean
}

export async function processMessageAsync(ctx: ProcessMessageParams) {
  const { supabase, normalizedPhone, body, messageSid, numMedia, params } = ctx
  let { patient } = ctx
  let savedMsgId: string | undefined

  try {
    // If unknown phone -> create patient record (ON CONFLICT for race-condition safety)
    if (!patient) {
      const clinicId = process.env.DEFAULT_CLINIC_ID || 'vhealth'

      // Use upsert-style: insert with ON CONFLICT to handle concurrent requests from the same phone
      const { data: existingPatient } = await supabase
        .from('patients')
        .select(PATIENT_SMS_SELECT)
        .eq('phone', normalizedPhone)
        .maybeSingle()

      if (existingPatient) {
        patient = existingPatient
      } else {
        const { data: newPatient, error: createError } = await supabase
          .from('patients')
          .insert({
            phone: normalizedPhone,
            clinic_id: clinicId, // Derived from env var; will be replaced by Twilio-number-to-clinic lookup when multi-tenancy is needed
          })
          .select(PATIENT_SMS_SELECT)
          .single()

        if (createError) {
          // Unique constraint race: another request already created this patient
          const { data: racePatient } = await supabase
            .from('patients')
            .select(PATIENT_SMS_SELECT)
            .eq('phone', normalizedPhone)
            .single()

          if (!racePatient) {
            console.error('[sms] Failed to create or find patient:', createError)
            return
          }
          patient = racePatient
        } else {
          patient = newPatient
        }
      }
    }

    if (!patient) return

    // Process MMS media: download from Twilio -> upload to Supabase Storage
    let mediaStoragePaths: string[] = []
    if (numMedia > 0) {
      const mediaResults = await processMMSMedia(params, numMedia, patient.id, supabase)
      mediaStoragePaths = mediaResults.map(r => r.storagePath)
    }

    // Save user message to DB immediately (for idempotency protection)
    const { data: savedMsg, error: saveError } = await supabase
      .from('messages')
      .insert({
        patient_id: patient.id,
        role: 'user',
        content: body,
        channel: 'sms',
        twilio_sid: messageSid,
        media_urls: mediaStoragePaths.length > 0 ? mediaStoragePaths : collectMediaUrls(numMedia, params),
      })
      .select('id')
      .single()

    if (saveError) {
      console.error('[sms] Failed to save user message:', saveError)
      return
    }
    savedMsgId = savedMsg?.id

    // Check if patient needs onboarding
    if (!patient.consent_at || !patient.name) {
      await handleSMSOnboarding(supabase, patient, body, normalizedPhone)
      return
    }

    // Build AI context
    const context = await buildContext(patient.id, supabase)

    const recentUserTexts = context.messages
      .filter(m => m.role === 'user')
      .slice(-2)
      .map(m => m.content)

    const profile = (patient.profile || {}) as { injury?: string; practitionerName?: string }
    const clinicName = process.env.CLINIC_NAME || 'V-Health'
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://vhealth.ai'

    // Build server-executed tools (metrics are persisted via tool execute, no manual step parsing)
    const serverTools = {
      log_metrics: createLogMetricsTool(patient.id, supabase, savedMsgId),
      get_history: createGetHistoryTool(patient.id, supabase),
    }

    // Run safety classification + AI
    const result = handleMessage({
      systemPromptParams: {
        clinicName,
        patientName: patient.name || undefined,
        patientCondition: profile.injury,
        patientLanguage: patient.language,
        channel: 'sms',
        practitionerName: patient.practitioner_name || profile.practitionerName,
        conversationCount: context.conversationCount,
        appUrl,
      },
      messages: context.messages.map(m => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
      })),
      currentMessage: body,
      channel: 'sms',
      recentMessageTexts: recentUserTexts,
      additionalTools: serverTools,
    })

    let replyText: string
    let isEmergency = false

    if (result.type === 'blocked') {
      replyText = result.blockMessage || "I can only help with recovery-related topics."
    } else if (result.type === 'emergency' && result.emergencyMessage) {
      replyText = result.emergencyMessage
      isEmergency = true

      const emergencyTimestamp = new Date().toISOString()

      // Log to Sentry as warning-level (no PHI — only patient ID and category)
      Sentry.captureMessage('Emergency safety classification triggered', {
        level: 'warning',
        tags: { component: 'sms-process', category: result.safetyResult.category },
        extra: { patientId: patient.id, channel: 'sms', timestamp: emergencyTimestamp },
      })

      console.warn(JSON.stringify({
        event: 'safety_classification',
        category: result.safetyResult.category,
        action: result.safetyResult.action,
        patientId: patient.id,
        channel: 'sms',
        timestamp: emergencyTimestamp,
      }))

      // Mark the user message as emergency
      if (savedMsgId) {
        const patientIdForLog = patient.id
        void supabase
          .from('messages')
          .update({ is_emergency: true })
          .eq('id', savedMsgId)
          .then(({ error }) => {
            if (error) console.error('[sms] Failed to flag user message as emergency:', { patientId: patientIdForLog })
          })
      }

      // Notify admin — fire-and-forget, must not block patient SMS response
      void sendEmergencyAlert({
        patientName: patient.name,
        patientPhone: normalizedPhone,
        triggeringMessage: body,
        timestamp: emergencyTimestamp,
        channel: 'sms',
      })
    } else if (result.stream) {
      try {
        const fullText = await result.stream.text
        replyText = formatSMSResponse(fullText, appUrl)
      } catch (aiErr) {
        // Claude API failure — send a reassuring fallback SMS and record for Sentry threshold
        console.error('[sms] Claude API error for patient:', patient.id, aiErr)
        recordAIFailure(patient.id, aiErr)
        const clinicPhone = process.env.CLINIC_PHONE || 'V-Health'
        const fallback = `I'm having trouble right now. Please try again in a few minutes or call ${clinicPhone}.`
        await sendSMSWithRetry({ to: normalizedPhone, body: fallback, patientId: patient.id })
        return
      }
    } else {
      console.error('[sms] Unexpected result type:', result.type)
      return
    }

    // Send reply via Twilio (with exponential backoff retry)
    await sendSMSWithRetry({ to: normalizedPhone, body: replyText, patientId: patient.id })

    // Save assistant message to DB
    await supabase.from('messages').insert({
      patient_id: patient.id,
      role: 'assistant',
      content: replyText,
      channel: 'sms',
      is_emergency: isEmergency,
    })
  } catch (err) {
    console.error('[sms] Error processing message:', err)
    // Mark the saved message as failed for observability (queryable via: select * from messages where content like '%[PROCESSING_FAILED]%')
    if (savedMsgId) {
      try {
        await supabase
          .from('messages')
          .update({ content: `${body}\n\n[PROCESSING_FAILED]: ${err instanceof Error ? err.message : 'Unknown error'}` })
          .eq('id', savedMsgId)
      } catch (updateErr) {
        console.error('[sms] Failed to mark message as failed:', updateErr)
      }
    }
  }
}

/** Collect raw media URLs from Twilio webhook params (fallback when MMS processing is unavailable) */
function collectMediaUrls(numMedia: number, params: Record<string, string>): string[] {
  const urls: string[] = []
  for (let i = 0; i < numMedia; i++) {
    const url = params[`MediaUrl${i}`]
    if (url) urls.push(url)
  }
  return urls
}
