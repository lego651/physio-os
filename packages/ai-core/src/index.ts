export { handleMessage, createConversation, conversationTools } from './engine'
export type { ConversationParams, ConversationResult, HandleMessageParams, HandleMessageResult } from './engine'

export { buildSystemPrompt, sanitizePromptValue } from './prompts/system'
export type { SystemPromptParams } from './prompts/system'

export { buildContext, estimateTokens, budgetMessages } from './context'
export type { ConversationContext } from './context'

export { classifyInput } from './safety'
export type { SafetyResult, SafetyCategory, SafetyAction } from './safety'

export { AIUnavailableError, AIRateLimitError } from './errors'

export { createLogMetricsTool } from './tools/log-metrics'
export { createGetHistoryTool } from './tools/get-history'
export { generateWeeklyReport } from './tools/generate-report'
export type { Report } from './tools/generate-report'
export { detectPatterns } from './tools/pattern-detection'
