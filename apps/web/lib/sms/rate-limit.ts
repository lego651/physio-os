/**
 * Simple in-memory rate limiter for SMS webhook.
 * Limits: 10 messages per phone number per hour.
 */

const WINDOW_MS = 60 * 60 * 1000 // 1 hour
const MAX_REQUESTS = 10

interface RateLimitEntry {
  timestamps: number[]
}

const store = new Map<string, RateLimitEntry>()

// Periodic cleanup to prevent memory leak
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000 // 10 minutes
let cleanupTimer: ReturnType<typeof setInterval> | null = null

function ensureCleanup() {
  if (cleanupTimer) return
  cleanupTimer = setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of store) {
      entry.timestamps = entry.timestamps.filter(t => now - t < WINDOW_MS)
      if (entry.timestamps.length === 0) store.delete(key)
    }
  }, CLEANUP_INTERVAL_MS)
  // Allow process to exit without waiting for cleanup
  if (typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
    cleanupTimer.unref()
  }
}

/**
 * Check if a phone number has exceeded the rate limit.
 * Returns true if the request should be allowed, false if rate limited.
 */
export function checkRateLimit(phone: string): boolean {
  ensureCleanup()

  const now = Date.now()
  const entry = store.get(phone)

  if (!entry) {
    store.set(phone, { timestamps: [now] })
    return true
  }

  // Remove expired timestamps
  entry.timestamps = entry.timestamps.filter(t => now - t < WINDOW_MS)

  if (entry.timestamps.length >= MAX_REQUESTS) {
    return false
  }

  entry.timestamps.push(now)
  return true
}
