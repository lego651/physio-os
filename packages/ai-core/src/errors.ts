export class AIUnavailableError extends Error {
  constructor(message = 'AI service is temporarily unavailable. Please try again later.') {
    super(message)
    this.name = 'AIUnavailableError'
  }
}

export class AIRateLimitError extends Error {
  constructor(message = 'AI rate limit exceeded. Please try again in a moment.') {
    super(message)
    this.name = 'AIRateLimitError'
  }
}
