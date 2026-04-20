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
import { verifySessionToken } from '@/lib/widget/session-token'
import { loadClinicKB } from '@/lib/widget/knowledge-base'
import { buildWidgetSystemPrompt } from '@/lib/widget/system-prompt'
import { WIDGET_CONSTANTS as C, WIDGET_MESSAGES as M } from '@/lib/widget/constants'

export const runtime = 'nodejs'
export const maxDuration = 30

const bodySchema = z.object({
  token: z.string().min(1),
  message: z.string().min(1).max(C.MAX_USER_MESSAGE_CHARS),
})

const envelopeSchema = z.object({
  reply: z.string().min(1).max(3000),
  on_topic: z.boolean(),
  show_lead_form: z.boolean().optional().default(false),
})

export async function POST(req: Request) {
  if (!isWidgetEnabled()) return NextResponse.json({ error: M.DISABLED }, { status: 503 })

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '0.0.0.0'
  const ipHash = hashIp(ip)
  const rl = await checkWidgetRateLimit(ipHash)
  if (!rl.allowed) return NextResponse.json({ error: M.RATE_LIMITED }, { status: 429 })

  const parsed = bodySchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  const { token, message } = parsed.data

  const session = await verifySessionToken(token)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // Bind token to current request IP — stops stolen-token replay from a
  // different network.
  if (session.iph !== ipHash) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const conversationId = session.cid
  const clinicSlug = session.clinic

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

  // Load prior history (without the new user message — we only persist on
  // successful Claude reply to avoid stranded user-only rows).
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

  // Build messages array from prior history PLUS the new user message (do NOT
  // re-read from DB — the user row isn't inserted until we know Claude
  // succeeded).
  const claudeMessages = [
    ...(history ?? []).map(h => ({ role: h.role as 'user' | 'assistant', content: h.content })),
    { role: 'user' as const, content: message },
  ]

  try {
    const { output, usage } = await generateText({
      model: provider(C.MODEL_ID),
      output: Output.object({ schema: envelopeSchema }),
      system: buildWidgetSystemPrompt(kb),
      messages: claudeMessages,
      maxOutputTokens: C.MAX_TOKENS,
      abortSignal: AbortSignal.timeout(C.CONVO_TIMEOUT_MS),
    })

    // Persist user + assistant messages AFTER Claude succeeds. If a persist
    // call fails, log to Sentry but still return the reply — the user already
    // sees their message locally and a failed write shouldn't erase the
    // assistant's response.
    const { error: userInsertErr } = await supabase.from('widget_messages').insert({
      conversation_id: conversationId, role: 'user', content: message,
    })
    if (userInsertErr) {
      Sentry.captureException(userInsertErr, { tags: { component: 'widget-chat', step: 'insert-user' } })
    }

    const { error: assistantInsertErr } = await supabase.from('widget_messages').insert({
      conversation_id: conversationId, role: 'assistant', content: output.reply,
      tokens_in: usage?.inputTokens ?? 0, tokens_out: usage?.outputTokens ?? 0, on_topic: output.on_topic,
    })
    if (assistantInsertErr) {
      Sentry.captureException(assistantInsertErr, { tags: { component: 'widget-chat', step: 'insert-assistant' } })
    }

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
    }).catch(() => {/* best-effort */})

    return NextResponse.json({
      reply: output.reply,
      on_topic: output.on_topic,
      locked,
      show_lead_form: output.show_lead_form === true,
    })
  } catch (e) {
    // Claude call failed — do NOT persist the stranded user message.
    Sentry.captureException(e, { tags: { component: 'widget-chat' } })
    return NextResponse.json({ reply: M.ERROR_GENERIC, on_topic: true, error: true }, { status: 200 })
  }
}
