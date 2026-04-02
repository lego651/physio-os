import { UIMessage } from 'ai'
import { createClient } from '@/lib/supabase/server'
import {
  createConversation,
  classifyInput,
  AIUnavailableError,
} from '@physio-os/ai-core'
import type { PatientProfile } from '@physio-os/shared'

export const maxDuration = 30

const RATE_LIMIT_MAX = 20
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000 // 1 hour

// Simple in-memory rate limiting (resets on cold start — acceptable for V1)
const rateLimitMap = new Map<string, { count: number; windowStart: number }>()

function checkRateLimit(patientId: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(patientId)

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(patientId, { count: 1, windowStart: now })
    return true
  }

  if (entry.count >= RATE_LIMIT_MAX) return false
  entry.count++
  return true
}

export async function POST(req: Request) {
  const supabase = await createClient()

  // Auth check
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  // Get patient record
  const { data: patient } = await supabase
    .from('patients')
    .select('*')
    .eq('auth_user_id', user.id)
    .single()

  if (!patient) {
    return new Response('Patient record not found', { status: 404 })
  }

  // Check opted out
  if (patient.opted_out) {
    return new Response('Account has opted out of AI chat', { status: 403 })
  }

  // Check onboarding complete
  if (!patient.consent_at || !patient.name) {
    return new Response('Please complete onboarding first', { status: 400 })
  }

  // Rate limiting
  if (!checkRateLimit(patient.id)) {
    return new Response('Rate limit exceeded. Please try again later.', { status: 429 })
  }

  // Parse request body
  const { messages }: { messages: UIMessage[] } = await req.json()

  if (!messages || messages.length === 0) {
    return new Response('Message is required', { status: 400 })
  }

  const lastMessage = messages[messages.length - 1]
  const lastTextPart = lastMessage?.parts?.find(p => p.type === 'text')
  const currentMessageText = lastTextPart ? lastTextPart.text : ''

  if (!currentMessageText.trim()) {
    return new Response('Empty message', { status: 400 })
  }

  // Safety check
  const safetyResult = classifyInput(currentMessageText)

  if (safetyResult.action === 'block') {
    return new Response(
      JSON.stringify({
        error: "I can only help with recovery-related topics. Let's focus on your progress!",
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  // Emergency: return hard-coded response immediately — don't rely on LLM
  if (safetyResult.category === 'emergency') {
    console.warn(`[EMERGENCY] Patient ${patient.id}: ${safetyResult.reason}`)
    const emergencyMsg =
      "I'm concerned about what you're describing. Please contact your practitioner or call emergency services (911) right away. If you're in crisis, the 988 Suicide & Crisis Lifeline is available 24/7. Your safety is the top priority."

    await supabase.from('messages').insert([
      { patient_id: patient.id, role: 'user', content: currentMessageText, channel: 'web' },
      { patient_id: patient.id, role: 'assistant', content: emergencyMsg, channel: 'web' },
    ])

    return new Response(
      JSON.stringify({ emergencyMessage: emergencyMsg }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }

  // Save user message to DB
  const { data: savedUserMsg } = await supabase
    .from('messages')
    .insert({
      patient_id: patient.id,
      role: 'user',
      content: currentMessageText,
      channel: 'web',
    })
    .select()
    .single()

  // Load recent metrics for context
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  // TODO: pass recentMetrics to context builder in S3 when get_history tool is wired
  await supabase
    .from('metrics')
    .select('*')
    .eq('patient_id', patient.id)
    .gte('recorded_at', sevenDaysAgo.toISOString())
    .order('recorded_at', { ascending: false })
    .limit(20)

  // Count conversations for scale education
  const { count: conversationCount } = await supabase
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('patient_id', patient.id)
    .eq('role', 'user')

  const profile = (patient.profile || {}) as PatientProfile

  try {
    const result = createConversation({
      systemPromptParams: {
        clinicName: 'V-Health',
        patientName: patient.name || undefined,
        patientCondition: profile.injury,
        patientLanguage: patient.language,
        channel: 'web',
        practitionerName: patient.practitioner_name || profile.practitionerName,
        conversationCount: conversationCount || 0,
      },
      messages: messages.slice(0, -1).map(m => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.parts
          .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
          .map(p => p.text)
          .join(''),
      })),
      currentMessage: currentMessageText,
      channel: 'web',
    })

    // Save assistant response after stream completes
    void Promise.resolve(result.text).then(async (text: string) => {
      await supabase.from('messages').insert({
        patient_id: patient.id,
        role: 'assistant',
        content: text,
        channel: 'web',
      })

      // Handle tool calls — save metrics if log_metrics was called
      const steps = await Promise.resolve(result.steps)
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
              source_message_id: savedUserMsg?.id,
            })
          }
        }
      }
    }).catch((err: unknown) => {
      console.error('Failed to save assistant message:', err)
    })

    return result.toUIMessageStreamResponse()
  } catch (error) {
    console.error('AI conversation error:', error)

    if (error instanceof AIUnavailableError) {
      // Save fallback message to DB
      const fallbackMessage =
        "I'm having trouble responding right now. Please try again in a moment, or contact V-Health directly."
      await supabase.from('messages').insert({
        patient_id: patient.id,
        role: 'system',
        content: fallbackMessage,
        channel: 'web',
      })
      return new Response(JSON.stringify({ error: fallbackMessage }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(
      JSON.stringify({ error: 'Something went wrong. Please try again.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
}
