export class AIUnavailableError extends Error {
  constructor(message = 'AI service is temporarily unavailable. Please try again later.') {
    super(message)
    this.name = 'AIUnavailableError'
    Object.setPrototypeOf(this, AIUnavailableError.prototype)
  }
}

export class AIRateLimitError extends Error {
  readonly retryAfterMs: number

  constructor(
    message = 'AI rate limit exceeded. Please try again in a moment.',
    retryAfterMs = 60_000,
  ) {
    super(message)
    this.name = 'AIRateLimitError'
    this.retryAfterMs = retryAfterMs
    Object.setPrototypeOf(this, AIRateLimitError.prototype)
  }
}
