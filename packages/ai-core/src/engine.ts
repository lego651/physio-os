import { streamText, tool } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'
import type { Channel } from '@physio-os/shared'
import { buildSystemPrompt, type SystemPromptParams } from './prompts/system'

export interface ConversationParams {
  systemPromptParams: SystemPromptParams
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
  currentMessage: string
  channel: Channel
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ConversationResult = Awaited<ReturnType<typeof streamText<any, any>>>

const MAX_TOKENS_WEB = 1024
const MAX_TOKENS_SMS = 256
const DEFAULT_MODEL = 'claude-sonnet-4-20250514'
const MAX_RETRIES = 2

export const conversationTools = {
  log_metrics: tool({
    description:
      'Log patient recovery metrics extracted from the conversation. Call this whenever the patient mentions pain levels, discomfort, sitting tolerance, or exercises completed.',
    inputSchema: z.object({
      pain_level: z.number().min(1).max(10).optional().describe('Pain level on a scale of 1-10'),
      discomfort: z.number().min(0).max(3).optional().describe('Discomfort on a scale of 0-3'),
      sitting_tolerance_min: z
        .number()
        .min(0)
        .optional()
        .describe('How long the patient can sit comfortably in minutes'),
      exercises_done: z
        .array(z.string())
        .optional()
        .describe('List of exercise names the patient completed'),
      exercise_count: z.number().min(0).optional().describe('Number of exercises done'),
      notes: z.string().optional().describe('Additional context or notes'),
    }),
  }),
  get_history: tool({
    description:
      'Get the patient recovery history summary for the past 7 days. Use this to provide context about trends.',
    inputSchema: z.object({
      metric_type: z
        .enum(['pain', 'discomfort', 'sitting_tolerance', 'exercises', 'all'])
        .describe('Which metric history to retrieve'),
    }),
  }),
}

export function createConversation(params: ConversationParams): ConversationResult {
  const { systemPromptParams, messages, currentMessage, channel } = params
  const model = process.env.AI_MODEL || DEFAULT_MODEL
  const maxOutputTokens = channel === 'sms' ? MAX_TOKENS_SMS : MAX_TOKENS_WEB

  const systemPrompt = buildSystemPrompt(systemPromptParams)

  const allMessages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [
    ...messages,
    { role: 'user' as const, content: currentMessage },
  ]

  return streamText({
    model: anthropic(model),
    system: systemPrompt,
    messages: allMessages,
    tools: conversationTools,
    maxOutputTokens,
    temperature: 0.7,
    maxRetries: MAX_RETRIES,
    abortSignal: AbortSignal.timeout(channel === 'sms' ? 12000 : 30000),
    onError({ error }) {
      console.error('[AI stream error]', error)
    },
  })
}
