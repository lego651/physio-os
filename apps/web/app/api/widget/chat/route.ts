// apps/web/app/api/widget/chat/route.ts
import * as Sentry from '@sentry/nextjs'
import { z } from 'zod'
import { createAnthropic } from '@ai-sdk/anthropic'
import { generateText, Output } from 'ai'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isWidgetEnabled } from '@/lib/widget/kill-switch'
import { checkWidgetRateLimit, hashIp } from '@/lib/widget/rate-limit'
import { isAllowedOrigin, getAllowedOrigins } from '@/lib/widget/origin'
import { checkConversationState, registerOffTopicStrike } from '@/lib/widget/session'
import { loadClinicKB } from '@/lib/widget/knowledge-base'
import { buildWidgetSystemPrompt } from '@/lib/widget/system-prompt'
import { WIDGET_CONSTANTS as C, WIDGET_MESSAGES as M } from '@/lib/widget/constants'

export const runtime = 'nodejs'
export const maxDuration = 30

const bodySchema = z.object({
  conversationId: z.string().uuid(),
  clinicSlug: z.string().min(1),
  message: z.string().min(1).max(C.MAX_USER_MESSAGE_CHARS),
})

const envelopeSchema = z.object({
  reply: z.string().min(1).max(3000),
  on_topic: z.boolean(),
})

export async function POST(req: Request) {
  if (!isWidgetEnabled()) return NextResponse.json({ error: M.DISABLED }, { status: 503 })

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '0.0.0.0'
  const rl = await checkWidgetRateLimit(hashIp(ip))
  if (!rl.allowed) return NextResponse.json({ error: M.RATE_LIMITED }, { status: 429 })

  const parsed = bodySchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  const { conversationId, clinicSlug, message } = parsed.data

  const supabase = createAdminClient()

  const kb = await loadClinicKB(supabase, clinicSlug)
  if (!kb) return NextResponse.json({ error: 'Unknown clinic' }, { status: 404 })

  const origin = req.headers.get('origin')
  if (!isAllowedOrigin(origin, getAllowedOrigins(kb.clinic.domain))) {
    return NextResponse.json({ error: M.FORBIDDEN_ORIGIN }, { status: 403 })
  }

  const state = await checkConversationState(supabase, conversationId)
  if (state.blocked) {
    const text = state.reason === 'locked' ? M.LOCKED_OFFTOPIC : state.reason === 'cap_reached' ? M.CAP_REACHED : M.ERROR_GENERIC
    return NextResponse.json({ reply: text, on_topic: true, blocked: true, reason: state.reason })
  }

  // Persist user message
  await supabase.from('widget_messages').insert({
    conversation_id: conversationId, role: 'user', content: message,
  })

  // Load last N messages for context
  const { data: history } = await supabase
    .from('widget_messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(30)

  const anthropicKey = process.env.ANTHROPIC_API_KEY_WIDGET
  if (!anthropicKey) {
    Sentry.captureMessage('widget: ANTHROPIC_API_KEY_WIDGET missing', 'error')
    return NextResponse.json({ error: M.DISABLED }, { status: 503 })
  }
  const provider = createAnthropic({ apiKey: anthropicKey })

  try {
    const { output, usage } = await generateText({
      model: provider(C.MODEL_ID),
      output: Output.object({ schema: envelopeSchema }),
      system: buildWidgetSystemPrompt(kb),
      messages: (history ?? []).map(h => ({ role: h.role as 'user' | 'assistant', content: h.content })),
      maxOutputTokens: C.MAX_TOKENS,
      abortSignal: AbortSignal.timeout(C.CONVO_TIMEOUT_MS),
    })

    // Persist assistant message + on_topic flag
    await supabase.from('widget_messages').insert({
      conversation_id: conversationId, role: 'assistant', content: output.reply,
      tokens_in: usage?.inputTokens ?? 0, tokens_out: usage?.outputTokens ?? 0, on_topic: output.on_topic,
    })

    // Strike logic
    let locked = false
    if (!output.on_topic) {
      const s = await registerOffTopicStrike(supabase, conversationId)
      locked = s.locked
    }

    // Bump usage rollup (best-effort)
    const today = new Date().toISOString().slice(0, 10)
    await supabase.rpc('widget_usage_increment', {
      p_clinic_id: kb.clinic.id, p_date: today,
      p_tokens_in: usage?.inputTokens ?? 0, p_tokens_out: usage?.outputTokens ?? 0,
    }).catch(() => {/* rpc added in Task 5.4 — ignore until then */})

    return NextResponse.json({ reply: output.reply, on_topic: output.on_topic, locked })
  } catch (e) {
    Sentry.captureException(e, { tags: { component: 'widget-chat' } })
    return NextResponse.json({ reply: M.ERROR_GENERIC, on_topic: true, error: true }, { status: 200 })
  }
}
