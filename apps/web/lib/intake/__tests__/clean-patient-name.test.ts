/**
 * Unit tests for cleanPatientName (Bug L)
 * RED phase: clean-patient-name.ts does not yet exist — all tests must fail.
 *
 * Failure modes tested (per brief):
 *   1. "Chai Siu Liu"          → "Cathy Liu"        (core phonetic fix)
 *   2. "John Smith"            → "John Smith"       (no regression on clean input)
 *   3. "Wai Chung Wong"        → "Wai Chung Wong"   (legit Chinese-English name, don't touch)
 *   4. ""                      → fast-path skip, no LLM call
 *   5. "X" (< 2 chars)         → fast-path skip, no LLM call
 *   6. Claude throws           → fallback to raw transcript, no crash
 *   7. Hallucination already blocked upstream → tested by route layer, not here
 *   8. Long name unchanged     → "Mary Catherine Elizabeth Jones" not compressed
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock AI SDK before importing so no real API call is made.
vi.mock('ai', () => ({
  generateText: vi.fn(),
}))

vi.mock('@ai-sdk/anthropic', () => ({
  anthropic: vi.fn(() => 'mock-haiku-model'),
}))

const { cleanPatientName } = await import('../clean-patient-name')
const { generateText } = await import('ai')

const mockGenerateText = vi.mocked(generateText)

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockClaude(returnedName: string) {
  mockGenerateText.mockResolvedValueOnce({
    text: returnedName,
  } as Awaited<ReturnType<typeof generateText>>)
}

// ── Failure mode 1: core phonetic fix ────────────────────────────────────────

describe('cleanPatientName — failure mode 1: core phonetic case', () => {
  beforeEach(() => mockGenerateText.mockClear())

  it('returns "Cathy Liu" when Claude corrects "Chai Siu Liu"', async () => {
    mockClaude('Cathy Liu')
    const result = await cleanPatientName('Chai Siu Liu')
    expect(result.name).toBe('Cathy Liu')
    expect(result.raw).toBe('Chai Siu Liu')
  })

  it('calls generateText once for a non-trivial transcript', async () => {
    mockClaude('Cathy Liu')
    await cleanPatientName('Chai Siu Liu')
    expect(mockGenerateText).toHaveBeenCalledOnce()
  })

  it('passes the raw transcript into the prompt so Claude can reason about it', async () => {
    mockClaude('Cathy Liu')
    await cleanPatientName('Chai Siu Liu')
    const callArg = mockGenerateText.mock.calls[0]![0] as { prompt: string }
    expect(callArg.prompt).toContain('Chai Siu Liu')
  })
})

// ── Failure mode 2: no regression on already-correct name ────────────────────

describe('cleanPatientName — failure mode 2: already-correct English name', () => {
  beforeEach(() => mockGenerateText.mockClear())

  it('returns "John Smith" unchanged when Claude confirms it', async () => {
    mockClaude('John Smith')
    const result = await cleanPatientName('John Smith')
    expect(result.name).toBe('John Smith')
    expect(result.raw).toBe('John Smith')
  })
})

// ── Failure mode 3: legitimate Chinese-English name — do not alter ────────────

describe('cleanPatientName — failure mode 3: Chinese-English name', () => {
  beforeEach(() => mockGenerateText.mockClear())

  it('returns "Wai Chung Wong" unchanged when Claude confirms it', async () => {
    mockClaude('Wai Chung Wong')
    const result = await cleanPatientName('Wai Chung Wong')
    expect(result.name).toBe('Wai Chung Wong')
    expect(result.raw).toBe('Wai Chung Wong')
  })
})

// ── Failure mode 4: empty string — fast-path, no LLM ─────────────────────────

describe('cleanPatientName — failure mode 4: empty string fast-path', () => {
  beforeEach(() => mockGenerateText.mockClear())

  it('returns raw empty string without calling Claude', async () => {
    const result = await cleanPatientName('')
    expect(result.name).toBe('')
    expect(result.raw).toBe('')
    expect(mockGenerateText).not.toHaveBeenCalled()
  })
})

// ── Failure mode 5: single char — fast-path, no LLM ──────────────────────────

describe('cleanPatientName — failure mode 5: too-short fast-path (< 2 chars)', () => {
  beforeEach(() => mockGenerateText.mockClear())

  it('returns single char unchanged without calling Claude', async () => {
    const result = await cleanPatientName('X')
    expect(result.name).toBe('X')
    expect(result.raw).toBe('X')
    expect(mockGenerateText).not.toHaveBeenCalled()
  })

  it('does NOT fast-path "OK" (exactly 2 chars) — calls Claude', async () => {
    mockClaude('OK')
    const result = await cleanPatientName('OK')
    expect(result.name).toBe('OK')
    expect(mockGenerateText).toHaveBeenCalledOnce()
  })
})

// ── Failure mode 6: Claude throws — fallback to raw, no crash ────────────────

describe('cleanPatientName — failure mode 6: LLM failure fallback', () => {
  beforeEach(() => mockGenerateText.mockClear())

  it('returns raw transcript when generateText throws', async () => {
    mockGenerateText.mockRejectedValueOnce(new Error('network timeout'))
    const result = await cleanPatientName('Kathy Lou')
    expect(result.name).toBe('Kathy Lou')
    expect(result.raw).toBe('Kathy Lou')
  })

  it('does NOT throw when generateText throws', async () => {
    mockGenerateText.mockRejectedValueOnce(new Error('api error'))
    await expect(cleanPatientName('Some Name')).resolves.not.toThrow()
  })
})

// ── Failure mode 8: long name — not compressed ───────────────────────────────

describe('cleanPatientName — failure mode 8: long name not compressed', () => {
  beforeEach(() => mockGenerateText.mockClear())

  it('preserves long name "Mary Catherine Elizabeth Jones" when Claude returns it unchanged', async () => {
    const longName = 'Mary Catherine Elizabeth Jones'
    mockClaude(longName)
    const result = await cleanPatientName(longName)
    expect(result.name).toBe(longName)
  })
})

// ── Model assertion: must use claude-haiku-4-5 ───────────────────────────────

describe('cleanPatientName — L7: model must be claude-haiku-4-5', () => {
  beforeEach(() => mockGenerateText.mockClear())

  it('calls anthropic() with "claude-haiku-4-5"', async () => {
    const { anthropic } = await import('@ai-sdk/anthropic')
    const mockAnthropic = vi.mocked(anthropic)
    mockClaude('Cathy Liu')
    await cleanPatientName('Chai Siu Liu')
    expect(mockAnthropic).toHaveBeenCalledWith('claude-haiku-4-5')
  })
})

// ── L10: end-to-end pipeline: raw → cleaned, asserts core case ───────────────

describe('cleanPatientName — L10: pipeline assertion (Whisper output → cleaned name)', () => {
  beforeEach(() => mockGenerateText.mockClear())

  it('"Chai Siu Liu" in → "Cathy Liu" out (full pipeline mock)', async () => {
    // Simulate: Whisper outputs "Chai Siu Liu", Claude corrects to "Cathy Liu"
    mockClaude('Cathy Liu')
    const { name, raw } = await cleanPatientName('Chai Siu Liu')
    expect(name).toBe('Cathy Liu')    // cleaned name goes to bubble
    expect(raw).toBe('Chai Siu Liu')  // raw preserved for logging
  })

  it('"Kathy Lou" in → "Kathy Lou" out (near-correct, Claude confirms)', async () => {
    mockClaude('Kathy Lou')
    const { name } = await cleanPatientName('Kathy Lou')
    expect(name).toBe('Kathy Lou')
  })
})
