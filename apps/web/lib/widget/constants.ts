export const WIDGET_CONSTANTS = {
  MAX_USER_MESSAGE_CHARS: 500,
  MAX_ASSISTANT_WORDS: 200,
  MAX_TOKENS: 320, // ~200 words + buffer
  MAX_MESSAGES_PER_CONVERSATION: 20,
  OFFTOPIC_STRIKE_LIMIT: 3,
  RATE_LIMIT_PER_MIN: 10,
  RATE_LIMIT_PER_HOUR: 30,
  RATE_LIMIT_PER_DAY: 50,
  MODEL_ID: 'claude-haiku-4-5-20251001',
  CONVO_TIMEOUT_MS: 25_000,
} as const

export const WIDGET_MESSAGES = {
  DISABLED: 'Our assistant is temporarily unavailable. Please call us at 403-966-6386.',
  CAP_REACHED: 'This chat has reached its message limit. Please text us at 403-966-6386 to continue.',
  RATE_LIMITED: 'You are sending messages too quickly. Please wait a moment.',
  LOCKED_OFFTOPIC: 'This chat is for V-Health questions only. Refresh to start a new session.',
  FORBIDDEN_ORIGIN: 'This widget can only run on approved domains.',
  TURNSTILE_FAILED: 'Verification failed. Please refresh and try again.',
  ERROR_GENERIC: 'Something went wrong. Please text us at 403-966-6386.',
} as const
