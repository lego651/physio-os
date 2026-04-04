import { streamText, tool } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'
import type { Channel } from '@physio-os/shared'
import { buildSystemPrompt, type SystemPromptParams } from './prompts/system'
import { classifyInput, type SafetyResult } from './safety'

export interface ConversationParams {
  systemPromptParams: SystemPromptParams
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
  currentMessage: string
  channel: Channel
  temperature?: number
  /** Additional server-executed tools to merge with the default conversation tools */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  additionalTools?: Record<string, any>
}

export interface HandleMessageParams extends ConversationParams {
  recentMessageTexts?: string[]
}

export interface HandleMessageResult {
  type: 'stream' | 'emergency' | 'blocked'
  safetyResult: SafetyResult
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stream?: Awaited<ReturnType<typeof streamText<any, any>>>
  emergencyMessage?: string
  blockMessage?: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ConversationResult = Awaited<ReturnType<typeof streamText<any, any>>>

const MAX_TOKENS_WEB = 1024
const MAX_TOKENS_SMS = 256
const DEFAULT_MODEL = 'claude-sonnet-4-20250514'
const DEFAULT_TEMPERATURE = 0.4
const DEFAULT_TEMPERATURE_SMS = 0.2
const MAX_RETRIES = 2
const TIMEOUT_WEB_MS = 30000
const TIMEOUT_SMS_MS = 12000

const EMERGENCY_MESSAGE =
  "I'm concerned about what you're describing. Please contact your practitioner or call emergency services (911) right away. If you're in crisis, the 988 Suicide & Crisis Lifeline is available 24/7. Your safety is the top priority."

const BLOCK_MESSAGE =
  "I can only help with recovery-related topics. Let's focus on your progress!"

/** Base conversation tools (no execute — used as fallback for web chat without server tools) */
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
      notes: z.string().optional().describe('Additional context or notes'),
    }),
  }),
}

/**
 * Primary API — enforces safety classification before LLM call.
 * Callers should use this instead of createConversation directly.
 */
export function handleMessage(params: HandleMessageParams): HandleMessageResult {
  const { currentMessage, recentMessageTexts } = params

  // 1. Safety classification (enforced — cannot be skipped)
  const safetyResult = classifyInput(currentMessage, recentMessageTexts)

  // 2. Block adversarial messages
  if (safetyResult.action === 'block') {
    return {
      type: 'blocked',
      safetyResult,
      blockMessage: BLOCK_MESSAGE,
    }
  }

  // 3. Emergency — return structured response without calling LLM
  if (safetyResult.category === 'emergency') {
    return {
      type: 'emergency',
      safetyResult,
      emergencyMessage: EMERGENCY_MESSAGE,
    }
  }

  // 4. Safe — proceed to LLM
  const stream = createConversation(params)
  return {
    type: 'stream',
    safetyResult,
    stream,
  }
}

export function createConversation(params: ConversationParams): ConversationResult {
  const { systemPromptParams, messages, currentMessage, channel, temperature, additionalTools } = params
  const model = process.env.AI_MODEL || DEFAULT_MODEL
  const maxOutputTokens = channel === 'sms' ? MAX_TOKENS_SMS : MAX_TOKENS_WEB
  const defaultTemp = channel === 'sms' ? DEFAULT_TEMPERATURE_SMS : DEFAULT_TEMPERATURE

  const systemPrompt = buildSystemPrompt(systemPromptParams)

  const allMessages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [
    ...messages,
    { role: 'user' as const, content: currentMessage },
  ]

  // Merge default tools with caller-supplied server-executed tools (e.g., createLogMetricsTool)
  const tools = additionalTools
    ? { ...conversationTools, ...additionalTools }
    : conversationTools

  return streamText({
    model: anthropic(model),
    system: systemPrompt,
    messages: allMessages,
    tools,
    maxOutputTokens,
    temperature: temperature ?? defaultTemp,
    maxRetries: MAX_RETRIES,
    abortSignal: AbortSignal.timeout(channel === 'sms' ? TIMEOUT_SMS_MS : TIMEOUT_WEB_MS),
    onError({ error }) {
      console.error('[AI stream error]', error)
    },
  })
}

