/**
 * Chat endpoint rate limiter — 20 requests per hour per patient.
 * Uses Upstash Redis in production (shared across instances/cold starts).
 * Falls back to in-memory for local development when UPSTASH_REDIS_REST_URL is not set.
 */

const WINDOW_SEC = 60 * 60 // 1 hour
const MAX_REQUESTS = 20

// ---------------------------------------------------------------------------
// Upstash Redis rate limiter (production)
// ---------------------------------------------------------------------------

let upstashLimiter: { limit: (key: string) => Promise<{ success: boolean }> } | null = null

async function getUpstashLimiter() {
  if (upstashLimiter) return upstashLimiter

  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null

  const { Ratelimit } = await import('@upstash/ratelimit')
  const { Redis } = await import('@upstash/redis')

  upstashLimiter = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(MAX_REQUESTS, `${WINDOW_SEC} s`),
    prefix: 'chat-rl',
  })
  return upstashLimiter
}

// ---------------------------------------------------------------------------
// In-memory fallback (local development only)
// ---------------------------------------------------------------------------

const WINDOW_MS = WINDOW_SEC * 1000
const memoryStore = new Map<string, number[]>()

function checkMemoryRateLimit(patientId: string): boolean {
  const now = Date.now()
  const timestamps = memoryStore.get(patientId)

  if (!timestamps) {
    memoryStore.set(patientId, [now])
    return true
  }

  const valid = timestamps.filter((t) => now - t < WINDOW_MS)
  if (valid.length === 0) {
    memoryStore.delete(patientId)
    memoryStore.set(patientId, [now])
    return true
  }

  if (valid.length >= MAX_REQUESTS) {
    memoryStore.set(patientId, valid)
    return false
  }

  valid.push(now)
  memoryStore.set(patientId, valid)
  return true
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check if a patient has exceeded the chat rate limit.
 * Returns true if the request should be allowed, false if rate limited.
 */
export async function checkChatRateLimit(patientId: string): Promise<boolean> {
  const limiter = await getUpstashLimiter()
  if (limiter) {
    const { success } = await limiter.limit(patientId)
    return success
  }
  return checkMemoryRateLimit(patientId)
}
