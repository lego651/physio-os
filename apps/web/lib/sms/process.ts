import type { Database } from '@physio-os/shared'
import type { AdminClient } from '@/lib/supabase/admin'
import { handleMessage, createLogMetricsTool, createGetHistoryTool } from '@physio-os/ai-core'
import { buildContext } from '@physio-os/ai-core'
import { sendSMSWithRetry, formatSMSResponse } from './send'
import { processMMSMedia } from './mms'
import { handleSMSOnboarding } from './onboarding'

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

    if (result.type === 'blocked') {
      replyText = result.blockMessage || "I can only help with recovery-related topics."
    } else if (result.type === 'emergency' && result.emergencyMessage) {
      replyText = result.emergencyMessage
    } else if (result.stream) {
      const fullText = await result.stream.text
      replyText = formatSMSResponse(fullText, appUrl)
    } else {
      console.error('[sms] Unexpected result type:', result.type)
      return
    }

    // Send reply via Twilio (with exponential backoff retry)
    await sendSMSWithRetry({ to: normalizedPhone, body: replyText })

    // Save assistant message to DB
    await supabase.from('messages').insert({
      patient_id: patient.id,
      role: 'assistant',
      content: replyText,
      channel: 'sms',
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
