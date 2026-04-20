import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: Object.assign(
    class {
      constructor(public opts: unknown) {}
      limit = vi.fn()
    },
    { slidingWindow: (n: number, w: string) => ({ n, w }) },
  ),
}))
vi.mock('@upstash/redis', () => ({ Redis: class { constructor(public o: unknown) {} } }))

import { checkWidgetRateLimit } from '../rate-limit'

describe('checkWidgetRateLimit', () => {
  beforeEach(() => {
    process.env.UPSTASH_REDIS_REST_URL = 'http://local'
    process.env.UPSTASH_REDIS_REST_TOKEN = 't'
  })
  it('returns allowed:true for first request on fresh key (in-memory fallback)', async () => {
    delete process.env.UPSTASH_REDIS_REST_URL
    const result = await checkWidgetRateLimit('127.0.0.1')
    expect(result.allowed).toBe(true)
  })
})
