import * as Sentry from '@sentry/nextjs'
import { createClient } from '@/lib/supabase/server'
import {
  handleMessage,
  AIUnavailableError,
  createLogMetricsTool,
  createGetHistoryTool,
} from '@physio-os/ai-core'
import { createUIMessageStreamResponse, type UIMessageChunk } from 'ai'
import type { PatientProfile } from '@physio-os/shared'
import { z } from 'zod'
import { checkChatRateLimit } from '@/lib/chat/rate-limit'
import { sendEmergencyAlert } from '@/lib/email/send-emergency-alert'

export const maxDuration = 30

const MAX_MESSAGE_LENGTH = 5000

const ALLOWED_ORIGINS = new Set([
  process.env.NEXT_PUBLIC_APP_URL,
  'https://vhealth.ai',
  'http://localhost:3000',
].filter(Boolean))

const requestSchema = z.object({
  message: z.string().min(1, 'Message is required').max(MAX_MESSAGE_LENGTH, 'Message too long'),
})

/**
 * Return an AI error as a streaming chat message so useChat renders it
 * inline rather than throwing a client-side error that breaks the UI.
 * The canRetry flag tells the client to show a Retry button.
 */
function streamErrorAsMessage(text: string): Response {
  const msgId = crypto.randomUUID()
  return createUIMessageStreamResponse({
    status: 200,
    headers: { 'x-can-retry': '1' },
    stream: new ReadableStream<UIMessageChunk>({
      start(controller) {
        controller.enqueue({ type: 'text-start', id: msgId })
        controller.enqueue({ type: 'text-delta', id: msgId, delta: text })
        controller.enqueue({ type: 'text-end', id: msgId })
        controller.close()
      },
    }),
  })
}

export async function POST(req: Request) {
  // Origin validation (CSRF protection)
  const origin = req.headers.get('origin')
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return new Response('Forbidden', { status: 403 })
  }

  const supabase = await createClient()

  // Auth check
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  // Get patient record with explicit columns
  const { data: patient, error: patientError } = await supabase
    .from('patients')
    .select('id, auth_user_id, name, language, phone, practitioner_name, profile, consent_at, opted_out')
    .eq('auth_user_id', user.id)
    .single()

  if (patientError || !patient) {
    Sentry.captureException(patientError ?? new Error('Patient record not found'), {
      tags: { component: 'chat-api' },
      extra: { userId: user.id },
    })
    return new Response('Patient record not found', { status: 404 })
  }

  if (patient.opted_out) {
    return new Response('Account has opted out of AI chat', { status: 403 })
  }

  if (!patient.consent_at || !patient.name) {
    return new Response('Please complete onboarding first', { status: 400 })
  }

  // Rate limit: 20 messages per patient per hour
  const allowed = await checkChatRateLimit(patient.id)
  if (!allowed) {
    return Response.json(
      { error: 'Too many messages. Please wait before sending another.' },
      { status: 429 },
    )
  }

  // Parse and validate request body
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message || 'Invalid request' },
      { status: 400 },
    )
  }

  const currentMessageText = parsed.data.message.trim()

  // Reconstruct conversation history from server (don't trust client)
  const { data: dbMessages, error: messagesError } = await supabase
    .from('messages')
    .select('id, role, content, created_at')
    .eq('patient_id', patient.id)
    .order('created_at', { ascending: false })
    .limit(50)

  if (messagesError) {
    console.error('[chat] Failed to load messages:', { patientId: patient.id })
    Sentry.captureException(messagesError, {
      tags: { component: 'chat-api', step: 'load-messages' },
      extra: { patientId: patient.id },
    })
    return Response.json({ error: 'Failed to load conversation' }, { status: 500 })
  }

  const serverMessages = (dbMessages || []).reverse()

  // Build recent message texts for multi-turn safety analysis
  const recentUserTexts = serverMessages
    .filter(m => m.role === 'user')
    .slice(-2)
    .map(m => m.content)

  // Count conversations for scale education
  const { count: conversationCount } = await supabase
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('patient_id', patient.id)
    .eq('role', 'user')

  const profile = (patient.profile || {}) as PatientProfile
  const clinicName = process.env.CLINIC_NAME || 'V-Health'

  // Save user message to DB first (need the ID for tool context)
  const { data: savedUserMsg, error: saveError } = await supabase
    .from('messages')
    .insert({
      patient_id: patient.id,
      role: 'user',
      content: currentMessageText,
      channel: 'web',
    })
    .select('id')
    .single()

  if (saveError) {
    console.error('[chat] Failed to save user message:', { patientId: patient.id })
  }

  // Build server-executed tools (metrics persisted via tool execute, no manual step parsing)
  const serverTools = {
    log_metrics: createLogMetricsTool(patient.id, supabase, savedUserMsg?.id),
    get_history: createGetHistoryTool(patient.id, supabase),
  }

  // Use handleMessage orchestrator (enforces safety)
  const result = handleMessage({
    systemPromptParams: {
      clinicName,
      patientName: patient.name || undefined,
      patientCondition: profile.injury,
      patientLanguage: patient.language,
      channel: 'web',
      practitionerName: patient.practitioner_name || profile.practitionerName,
      conversationCount: conversationCount || 0,
    },
    messages: serverMessages.map(m => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
    })),
    currentMessage: currentMessageText,
    channel: 'web',
    recentMessageTexts: recentUserTexts,
    additionalTools: serverTools,
  })

  // Handle blocked messages
  if (result.type === 'blocked') {
    return Response.json(
      { error: result.blockMessage },
      { status: 400 },
    )
  }

  // Handle emergency — save messages and return streaming format
  if (result.type === 'emergency' && result.emergencyMessage) {
    const emergencyTimestamp = new Date().toISOString()

    // Log to Sentry as warning-level (no PHI — only patient ID and category)
    Sentry.captureMessage('Emergency safety classification triggered', {
      level: 'warning',
      tags: { component: 'chat-route', category: result.safetyResult.category },
      extra: { patientId: patient.id, channel: 'web', timestamp: emergencyTimestamp },
    })

    console.warn(JSON.stringify({
      event: 'safety_classification',
      category: result.safetyResult.category,
      action: result.safetyResult.action,
      patientId: patient.id,
      timestamp: emergencyTimestamp,
    }))

    // Mark the user message (already saved above) as an emergency
    if (savedUserMsg?.id) {
      void supabase
        .from('messages')
        .update({ is_emergency: true })
        .eq('id', savedUserMsg.id)
        .then(({ error }) => {
          if (error) console.error('[chat] Failed to flag user message as emergency:', { patientId: patient.id })
        })
    }

    // Save assistant emergency response
    const { error: insertError } = await supabase.from('messages').insert({
      patient_id: patient.id,
      role: 'assistant',
      content: result.emergencyMessage,
      channel: 'web',
      is_emergency: true,
    })

    if (insertError) {
      console.error('[chat] Failed to save emergency messages:', { patientId: patient.id })
    }

    // Notify admin — fire-and-forget, must not block patient response
    void sendEmergencyAlert({
      patientName: patient.name,
      patientPhone: patient.phone,
      triggeringMessage: currentMessageText,
      timestamp: emergencyTimestamp,
      channel: 'web',
    })

    // Return emergency as streaming response so useChat can consume it
    const msgId = crypto.randomUUID()
    return createUIMessageStreamResponse({
      status: 200,
      stream: new ReadableStream<UIMessageChunk>({
        start(controller) {
          controller.enqueue({ type: 'text-start', id: msgId })
          controller.enqueue({ type: 'text-delta', id: msgId, delta: result.emergencyMessage! })
          controller.enqueue({ type: 'text-end', id: msgId })
          controller.close()
        },
      }),
    })
  }

  // Normal flow — stream LLM response
  if (!result.stream) {
    return Response.json({ error: 'Internal error' }, { status: 500 })
  }

  // Save assistant response after stream completes (metrics are handled by server-executed tools)
  void Promise.resolve(result.stream.text).then(async (text: string) => {
    const { error: assistantSaveError } = await supabase.from('messages').insert({
      patient_id: patient.id,
      role: 'assistant',
      content: text,
      channel: 'web',
    })

    if (assistantSaveError) {
      console.error('[chat] Failed to save assistant message:', { patientId: patient.id })
    }
  }).catch((err: unknown) => {
    console.error('[chat] Failed to save assistant message:', err)
  })

  try {
    return result.stream.toUIMessageStreamResponse()
  } catch (error) {
    console.error('[chat] AI conversation error:', error)
    Sentry.captureException(error, {
      tags: { component: 'chat-api', step: 'stream' },
      extra: { patientId: patient.id },
    })

    if (error instanceof AIUnavailableError) {
      return streamErrorAsMessage(
        "I'm having trouble responding right now. Please try again in a moment.",
      )
    }

    return streamErrorAsMessage(
      "Something went wrong. Please try again.",
    )
  }
}
