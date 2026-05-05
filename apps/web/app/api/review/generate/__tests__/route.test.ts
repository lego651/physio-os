import { describe, it, expect, vi, beforeEach } from 'vitest'

// Ensure required env vars are set before the route module is imported
// (route.ts hoists requireEnv() calls to module scope).
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? 'test-anthropic-key'
process.env.VHEALTH_GOOGLE_MAPS_REVIEW_URL =
  process.env.VHEALTH_GOOGLE_MAPS_REVIEW_URL ?? 'http://localhost:3000/review/test-success'

// Mock the AI SDK — preserve all other exports, override only generateText.
vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>()
  return {
    ...actual,
    generateText: vi.fn().mockResolvedValue({
      text: 'V-Health Rehab Clinic was great. The therapist was attentive and my back feels much better. Highly recommend!',
    }),
  }
})

// Mock the anthropic provider so we don't need a real API key.
vi.mock('@ai-sdk/anthropic', () => ({
  anthropic: vi.fn().mockReturnValue({ modelId: 'claude-haiku-4-5' }),
}))

describe('POST /api/review/generate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 400 when JSON body is invalid', async () => {
    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/review/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not-json',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Invalid JSON')
  })

  it('returns 400 when input field is missing', async () => {
    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/review/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('input field is required')
  })

  it('returns 200 with draft and reviewUrl when input is valid', async () => {
    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/review/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: 'great session, back feels much better' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.draft).toContain('V-Health')
    expect(body.reviewUrl).toBe('http://localhost:3000/review/test-success')
  })
})
