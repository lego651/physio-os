/**
 * SMS webhook rate limiter.
 * Uses Upstash Redis in production (works across cold starts and concurrent instances).
 * Falls back to in-memory for local development when UPSTASH_REDIS_REST_URL is not set.
 */

const WINDOW_SEC = 60 * 60 // 1 hour
const MAX_REQUESTS = 10

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
    prefix: 'sms-rl',
  })
  return upstashLimiter
}

// ---------------------------------------------------------------------------
// In-memory fallback (local development only)
// ---------------------------------------------------------------------------

const WINDOW_MS = WINDOW_SEC * 1000
const memoryStore = new Map<string, number[]>()

function checkMemoryRateLimit(phone: string): boolean {
  const now = Date.now()
  const timestamps = memoryStore.get(phone)

  if (!timestamps) {
    memoryStore.set(phone, [now])
    return true
  }

  const valid = timestamps.filter(t => now - t < WINDOW_MS)
  if (valid.length >= MAX_REQUESTS) {
    memoryStore.set(phone, valid)
    return false
  }

  valid.push(now)
  memoryStore.set(phone, valid)
  return true
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check if a phone number has exceeded the rate limit.
 * Returns true if the request should be allowed, false if rate limited.
 */
export async function checkRateLimit(phone: string): Promise<boolean> {
  const limiter = await getUpstashLimiter()
  if (limiter) {
    const { success } = await limiter.limit(phone)
    return success
  }
  // Fallback for local dev without Redis
  return checkMemoryRateLimit(phone)
}
