/**
 * Unit tests for matchTherapist (J2, J7, J8)
 * RED phase: matchTherapist does not yet exist — all tests fail.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the AI SDK before importing matchTherapist so the module can't reach the real API.
vi.mock('ai', () => ({
  generateText: vi.fn(),
  Output: {
    object: vi.fn((opts: { schema: unknown }) => ({ _tag: 'object', schema: opts.schema })),
  },
}))

vi.mock('@ai-sdk/anthropic', () => ({
  anthropic: vi.fn(() => 'mock-anthropic-model'),
}))

// Import after mocks are registered.
const { matchTherapist } = await import('../match-therapist')
const { generateText } = await import('ai')

const mockGenerateText = vi.mocked(generateText)

// ── Fixtures ─────────────────────────────────────────────────────────────────

const THERAPISTS = [
  { id: 'id-1', name: 'David Wang', role: 'therapist' },
  { id: 'id-2', name: 'David Liu', role: 'therapist' },
  { id: 'id-3', name: 'John Smith', role: 'therapist' },
  { id: 'id-4', name: 'Kathy Chen', role: 'therapist' },
]

// ── J7: empty list → null, no LLM call ───────────────────────────────────────

describe('matchTherapist — J7: empty therapist list', () => {
  beforeEach(() => mockGenerateText.mockClear())

  it('returns null when therapists list is empty', async () => {
    const result = await matchTherapist('David', [])
    expect(result).toBeNull()
  })

  it('does NOT call generateText when therapists list is empty', async () => {
    await matchTherapist('David', [])
    expect(mockGenerateText).not.toHaveBeenCalled()
  })
})

// ── J8: single therapist → return it, no LLM call ────────────────────────────

describe('matchTherapist — J8: single therapist in list', () => {
  beforeEach(() => mockGenerateText.mockClear())

  const SINGLE = [{ id: 'only-one', name: 'Maria Garcia', role: 'therapist' }]

  it('returns that therapist id without calling LLM', async () => {
    const result = await matchTherapist('Maria', SINGLE)
    expect(result).toBe('only-one')
  })

  it('does NOT call generateText when only one therapist', async () => {
    await matchTherapist('Maria', SINGLE)
    expect(mockGenerateText).not.toHaveBeenCalled()
  })
})

// ── J2: fuzzy match via LLM ───────────────────────────────────────────────────

describe('matchTherapist — J2: LLM fuzzy match', () => {
  beforeEach(() => mockGenerateText.mockClear())

  it('returns therapist id matched by LLM when transcript is "David"', async () => {
    // LLM returns the id of the first David
    mockGenerateText.mockResolvedValueOnce({
      output: { therapist_id: 'id-1' },
    } as Awaited<ReturnType<typeof generateText>>)

    const result = await matchTherapist('David', THERAPISTS)
    expect(result).toBe('id-1')
  })

  it('calls generateText with transcript and therapist names in prompt', async () => {
    mockGenerateText.mockResolvedValueOnce({
      output: { therapist_id: 'id-4' },
    } as Awaited<ReturnType<typeof generateText>>)

    await matchTherapist('Cathy', THERAPISTS)

    expect(mockGenerateText).toHaveBeenCalledOnce()
    const callArg = mockGenerateText.mock.calls[0]![0] as { prompt: string }
    expect(callArg.prompt).toContain('Cathy')
    expect(callArg.prompt).toContain('David Wang')
    expect(callArg.prompt).toContain('Kathy Chen')
  })

  it('returns null if LLM output id is not in the therapist list (safety guard)', async () => {
    // LLM hallucinated an id that doesn't exist
    mockGenerateText.mockResolvedValueOnce({
      output: { therapist_id: 'ghost-id' },
    } as Awaited<ReturnType<typeof generateText>>)

    const result = await matchTherapist('Unknown Person', THERAPISTS)
    expect(result).toBeNull()
  })

  it('returns null if generateText throws (network failure)', async () => {
    mockGenerateText.mockRejectedValueOnce(new Error('network error'))

    const result = await matchTherapist('David', THERAPISTS)
    expect(result).toBeNull()
  })

  it('returns null if Whisper transcript is empty string', async () => {
    const result = await matchTherapist('', THERAPISTS)
    expect(result).toBeNull()
  })

  it('does NOT call generateText when transcript is empty', async () => {
    await matchTherapist('', THERAPISTS)
    expect(mockGenerateText).not.toHaveBeenCalled()
  })
})

