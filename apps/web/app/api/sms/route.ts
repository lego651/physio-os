import { createClient } from '@supabase/supabase-js'
import type { Database } from '@physio-os/shared'
import { normalizePhone } from '@physio-os/shared'
import { handleMessage } from '@physio-os/ai-core'
import { buildContext } from '@physio-os/ai-core'
import { validateTwilioSignature } from '@/lib/sms/validate'
import { sendSMS, formatSMSResponse } from '@/lib/sms/send'
import { checkRateLimit } from '@/lib/sms/rate-limit'
import { waitUntil } from '@vercel/functions'

export const maxDuration = 15

/** Parse Twilio's application/x-www-form-urlencoded webhook body */
function parseTwilioBody(formData: FormData): Record<string, string> {
  const params: Record<string, string> = {}
  for (const [key, value] of formData.entries()) {
    params[key] = String(value)
  }
  return params
}

/** Create a Supabase admin client (service role — bypasses RLS) */
function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('Missing Supabase config')
  return createClient<Database>(url, serviceKey)
}

/** STOP/START/HELP keyword handler (S309) */
type KeywordAction = 'stop' | 'start' | 'help' | null

function detectKeyword(body: string): KeywordAction {
  const trimmed = body.trim().toUpperCase()
  if (trimmed === 'STOP' || trimmed.includes('STOP')) return 'stop'
  if (trimmed === 'START') return 'start'
  if (trimmed === 'HELP') return 'help'
  return null
}

async function handleKeyword(
  action: KeywordAction,
  phone: string,
  supabase: ReturnType<typeof createAdminClient>,
): Promise<string | null> {
  if (!action) return null

  if (action === 'stop') {
    await supabase.from('patients').update({ opted_out: true }).eq('phone', phone)
    return "You've been unsubscribed from V-Health Recovery Coach. Reply START to re-subscribe."
  }

  if (action === 'start') {
    await supabase.from('patients').update({ opted_out: false }).eq('phone', phone)
    return 'Welcome back! How are you feeling today?'
  }

  if (action === 'help') {
    return 'V-Health Recovery Coach helps you track your recovery. Reply STOP to unsubscribe. For urgent matters, call V-Health or 911.'
  }

  return null
}

export async function POST(req: Request) {
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!authToken) {
    console.error('[sms] Missing TWILIO_AUTH_TOKEN')
    return new Response('Server configuration error', { status: 500 })
  }

  // Step 1: Validate Twilio signature
  const signature = req.headers.get('x-twilio-signature') || ''
  const formData = await req.formData()
  const params = parseTwilioBody(formData)

  // Reconstruct the full URL Twilio signed against
  const requestUrl = new URL(req.url)
  const webhookUrl = `${requestUrl.origin}${requestUrl.pathname}`

  if (!validateTwilioSignature(authToken, signature, webhookUrl, params)) {
    return new Response('Invalid signature', { status: 403 })
  }

  // Step 2: Parse webhook payload
  const messageSid = params.MessageSid || ''
  const body = params.Body || ''
  const from = params.From || ''
  const numMedia = parseInt(params.NumMedia || '0', 10)

  if (!messageSid || !from) {
    return new Response('Missing required fields', { status: 400 })
  }

  const supabase = createAdminClient()

  // Step 3: Idempotency check (S310)
  const { data: existingMsg } = await supabase
    .from('messages')
    .select('id')
    .eq('twilio_sid', messageSid)
    .maybeSingle()

  if (existingMsg) {
    // Already processed — return 200
    return new Response('OK', { status: 200 })
  }

  // Step 4: Normalize phone number
  let normalizedPhone: string
  try {
    normalizedPhone = normalizePhone(from)
  } catch {
    console.error('[sms] Invalid phone number:', from)
    return new Response('OK', { status: 200 })
  }

  // Step 5: STOP/START/HELP keyword handling (S309) — before any other processing
  const keyword = detectKeyword(body)
  if (keyword) {
    const replyText = await handleKeyword(keyword, normalizedPhone, supabase)
    if (replyText) {
      // Send reply for keyword commands (except STOP which Twilio handles too)
      if (keyword !== 'stop') {
        await sendSMS({ to: normalizedPhone, body: replyText }).catch(err => {
          console.error('[sms] Failed to send keyword reply:', err)
        })
      }
    }
    return new Response('OK', { status: 200 })
  }

  // Step 6: Rate limit check
  if (!checkRateLimit(normalizedPhone)) {
    console.warn('[sms] Rate limited:', normalizedPhone)
    return new Response('OK', { status: 200 })
  }

  // Step 7: Identify patient
  const { data: patient } = await supabase
    .from('patients')
    .select('id, name, language, phone, practitioner_name, profile, consent_at, opted_out, clinic_id')
    .eq('phone', normalizedPhone)
    .maybeSingle()

  // Step 8: Check opted_out
  if (patient?.opted_out) {
    return new Response('OK', { status: 200 })
  }

  // Step 9: Return 200 immediately — process async
  // Save to determine if this is a new or existing patient
  const isNewPatient = !patient

  waitUntil(processMessageAsync({
    supabase,
    patient,
    normalizedPhone,
    body,
    messageSid,
    numMedia,
    params,
    isNewPatient,
  }))

  return new Response('OK', { status: 200 })
}

type PatientSMS = {
  id: string
  name: string | null
  language: string
  phone: string
  practitioner_name: string | null
  profile: unknown
  consent_at: string | null
  opted_out: boolean
  clinic_id: string
}

interface ProcessMessageParams {
  supabase: ReturnType<typeof createAdminClient>
  patient: PatientSMS | null
  normalizedPhone: string
  body: string
  messageSid: string
  numMedia: number
  params: Record<string, string>
  isNewPatient: boolean
}

async function processMessageAsync(ctx: ProcessMessageParams) {
  const { supabase, normalizedPhone, body, messageSid, numMedia, params } = ctx
  let { patient } = ctx

  try {
    // S304: If unknown phone → create patient record and start onboarding
    if (!patient) {
      const { data: newPatient, error: createError } = await supabase
        .from('patients')
        .insert({
          phone: normalizedPhone,
          clinic_id: 'vhealth',
        })
        .select('id, name, language, phone, practitioner_name, profile, consent_at, opted_out, clinic_id')
        .single()

      if (createError || !newPatient) {
        console.error('[sms] Failed to create patient:', createError)
        return
      }
      patient = newPatient as PatientSMS
    }

    if (!patient) return

    // Save user message to DB immediately (for idempotency protection)
    const { data: savedMsg, error: saveError } = await supabase
      .from('messages')
      .insert({
        patient_id: patient.id,
        role: 'user',
        content: body,
        channel: 'sms',
        twilio_sid: messageSid,
        media_urls: collectMediaUrls(numMedia, params),
      })
      .select('id')
      .single()

    if (saveError) {
      console.error('[sms] Failed to save user message:', saveError)
      return
    }

    // Check if patient needs onboarding (S304)
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
    })

    let replyText: string

    if (result.type === 'blocked') {
      replyText = result.blockMessage || "I can only help with recovery-related topics."
    } else if (result.type === 'emergency' && result.emergencyMessage) {
      replyText = result.emergencyMessage
    } else if (result.stream) {
      // For SMS, consume the full stream to get text (non-streaming delivery)
      const fullText = await result.stream.text
      replyText = formatSMSResponse(fullText, appUrl)

      // Process tool calls for metrics
      try {
        const steps = await result.stream.steps
        for (const step of steps) {
          for (const toolCall of step.toolCalls) {
            if (toolCall.toolName === 'log_metrics') {
              const input = toolCall.input as Record<string, unknown>
              await supabase.from('metrics').insert({
                patient_id: patient.id,
                pain_level: input.pain_level as number | undefined,
                discomfort: input.discomfort as number | undefined,
                sitting_tolerance_min: input.sitting_tolerance_min as number | undefined,
                exercises_done: input.exercises_done as string[] | undefined,
                exercise_count: input.exercise_count as number | undefined,
                notes: input.notes as string | undefined,
                source_message_id: savedMsg?.id,
              })
            }
          }
        }
      } catch (err) {
        console.error('[sms] Failed to process tool calls:', err)
      }
    } else {
      console.error('[sms] Unexpected result type:', result.type)
      return
    }

    // Send reply via Twilio
    let sendAttempts = 0
    while (sendAttempts < 2) {
      try {
        await sendSMS({ to: normalizedPhone, body: replyText })
        break
      } catch (err) {
        sendAttempts++
        if (sendAttempts >= 2) {
          console.error('[sms] Failed to send reply after 2 attempts:', err)
          return
        }
        // Wait 2s before retry
        await new Promise(r => setTimeout(r, 2000))
      }
    }

    // Save assistant message to DB
    await supabase.from('messages').insert({
      patient_id: patient.id,
      role: 'assistant',
      content: replyText,
      channel: 'sms',
    })
  } catch (err) {
    console.error('[sms] Error processing message:', err)
  }
}

/**
 * Handle SMS onboarding for patients without complete profiles (S304).
 * Stateless: checks which fields are missing and asks for the next one.
 */
async function handleSMSOnboarding(
  supabase: ReturnType<typeof createAdminClient>,
  patient: PatientSMS,
  messageBody: string,
  phone: string,
) {
  const profile = (patient.profile || {}) as Record<string, unknown>
  const trimmed = messageBody.trim()
  const upper = trimmed.toUpperCase()

  // Step 1: Consent
  if (!patient.consent_at) {
    if (upper === 'YES') {
      await supabase
        .from('patients')
        .update({ consent_at: new Date().toISOString() })
        .eq('id', patient.id)
      await sendSMS({ to: phone, body: "Great! What should we call you?" })
    } else if (upper === 'STOP') {
      await supabase
        .from('patients')
        .update({ opted_out: true })
        .eq('id', patient.id)
    } else {
      // First contact or non-YES reply
      const privacyUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://vhealth.ai'
      await sendSMS({
        to: phone,
        body: `Welcome to V-Health Recovery Coach! By continuing, you agree to our privacy policy: ${privacyUrl}/privacy. Reply YES to continue or STOP to opt out.`,
      })
    }
    return
  }

  // Step 2: Name
  if (!patient.name) {
    const name = trimmed.slice(0, 200)
    await supabase.from('patients').update({ name }).eq('id', patient.id)
    await sendSMS({ to: phone, body: "What brings you to V-Health? (e.g., back pain, shoulder injury)" })
    return
  }

  // Step 3: Condition (injury)
  if (!profile.injury) {
    const injury = trimmed.slice(0, 200)
    await supabase
      .from('patients')
      .update({ profile: { ...profile, injury } })
      .eq('id', patient.id)
    await sendSMS({ to: phone, body: "Preferred language? Reply 1 for English, 2 for 中文" })
    return
  }

  // Step 4: Language
  if (patient.language === 'en' && !profile._languageSet) {
    let language = 'en'
    if (trimmed === '2') language = 'zh'
    else if (trimmed !== '1' && trimmed !== '2') {
      await sendSMS({ to: phone, body: "Please reply 1 for English or 2 for 中文" })
      return
    }
    await supabase
      .from('patients')
      .update({ language, profile: { ...profile, _languageSet: true } })
      .eq('id', patient.id)
    await sendSMS({
      to: phone,
      body: `You're all set, ${patient.name}! How are you feeling right now? Rate your discomfort 0-3 (0=none, 1=mild, 2=moderate, 3=severe).`,
    })
    return
  }

  // Onboarding complete — should not reach here (caller checks consent_at + name)
}

/** Collect media URLs from Twilio webhook params */
function collectMediaUrls(numMedia: number, params: Record<string, string>): string[] {
  const urls: string[] = []
  for (let i = 0; i < numMedia; i++) {
    const url = params[`MediaUrl${i}`]
    if (url) urls.push(url)
  }
  return urls
}
