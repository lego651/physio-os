import { WIDGET_CONSTANTS as C } from './constants'

interface LimitResult { allowed: boolean; limit: string | null }

const memoryBuckets = new Map<string, { minute: number[]; hour: number[]; day: number[] }>()

async function getUpstash() {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  const { Ratelimit } = await import('@upstash/ratelimit')
  const { Redis } = await import('@upstash/redis')
  const redis = new Redis({ url, token })
  return {
    minute: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(C.RATE_LIMIT_PER_MIN, '60 s'), prefix: 'widget-rl-m' }),
    hour:   new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(C.RATE_LIMIT_PER_HOUR, '3600 s'), prefix: 'widget-rl-h' }),
    day:    new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(C.RATE_LIMIT_PER_DAY, '86400 s'), prefix: 'widget-rl-d' }),
  }
}

function checkMemory(ipHash: string): LimitResult {
  const now = Date.now()
  const b = memoryBuckets.get(ipHash) ?? { minute: [], hour: [], day: [] }
  b.minute = b.minute.filter(t => now - t < 60_000)
  b.hour   = b.hour.filter(t => now - t < 3_600_000)
  b.day    = b.day.filter(t => now - t < 86_400_000)
  if (b.minute.length >= C.RATE_LIMIT_PER_MIN) return { allowed: false, limit: 'minute' }
  if (b.hour.length   >= C.RATE_LIMIT_PER_HOUR) return { allowed: false, limit: 'hour' }
  if (b.day.length    >= C.RATE_LIMIT_PER_DAY)  return { allowed: false, limit: 'day' }
  b.minute.push(now); b.hour.push(now); b.day.push(now)
  memoryBuckets.set(ipHash, b)
  return { allowed: true, limit: null }
}

export async function checkWidgetRateLimit(ipHash: string): Promise<LimitResult> {
  const up = await getUpstash()
  if (!up) return checkMemory(ipHash)
  const [m, h, d] = await Promise.all([up.minute.limit(ipHash), up.hour.limit(ipHash), up.day.limit(ipHash)])
  if (!m.success) return { allowed: false, limit: 'minute' }
  if (!h.success) return { allowed: false, limit: 'hour' }
  if (!d.success) return { allowed: false, limit: 'day' }
  return { allowed: true, limit: null }
}

export function hashIp(ip: string): string {
  let h = 0
  for (let i = 0; i < ip.length; i++) h = (h * 31 + ip.charCodeAt(i)) | 0
  return `ip_${h}`
}
