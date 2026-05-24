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

// ── A-cluster: exact matches must resolve correctly ───────────────────────────
// Regression guard for the "Alex/Alice/Amy/Aurora" cluster bug.

const A_CLUSTER_THERAPISTS = [
  { id: 'id-alice', name: 'Alice', role: 'therapist' },
  { id: 'id-alex', name: 'Alex', role: 'therapist' },
  { id: 'id-amy', name: 'Amy', role: 'therapist' },
  { id: 'id-aurora', name: 'Aurora', role: 'therapist' },
  { id: 'id-lizzy', name: 'Dr. Lizzy (Ji) Li', role: 'therapist' },
  { id: 'id-kyle', name: 'Dr. Kyle Wu', role: 'therapist' },
]

describe('matchTherapist — A-cluster exact matches', () => {
  beforeEach(() => mockGenerateText.mockClear())

  it('returns Alex id when LLM unambiguously matches "Alex"', async () => {
    mockGenerateText.mockResolvedValueOnce({
      output: { therapist_id: 'id-alex' },
    } as Awaited<ReturnType<typeof generateText>>)

    const result = await matchTherapist('Alex', A_CLUSTER_THERAPISTS)
    expect(result).toBe('id-alex')
  })

  it('returns Alice id when LLM unambiguously matches "Alice"', async () => {
    mockGenerateText.mockResolvedValueOnce({
      output: { therapist_id: 'id-alice' },
    } as Awaited<ReturnType<typeof generateText>>)

    const result = await matchTherapist('Alice', A_CLUSTER_THERAPISTS)
    expect(result).toBe('id-alice')
  })

  it('returns Amy id when LLM unambiguously matches "Amy"', async () => {
    mockGenerateText.mockResolvedValueOnce({
      output: { therapist_id: 'id-amy' },
    } as Awaited<ReturnType<typeof generateText>>)

    const result = await matchTherapist('Amy', A_CLUSTER_THERAPISTS)
    expect(result).toBe('id-amy')
  })

  it('returns Lizzy id when LLM matches "Lizzy" to Dr. Lizzy (Ji) Li', async () => {
    mockGenerateText.mockResolvedValueOnce({
      output: { therapist_id: 'id-lizzy' },
    } as Awaited<ReturnType<typeof generateText>>)

    const result = await matchTherapist('Lizzy', A_CLUSTER_THERAPISTS)
    expect(result).toBe('id-lizzy')
  })

  it('returns Dr. Kyle Wu id when LLM matches "Doctor Kyle"', async () => {
    mockGenerateText.mockResolvedValueOnce({
      output: { therapist_id: 'id-kyle' },
    } as Awaited<ReturnType<typeof generateText>>)

    const result = await matchTherapist('Doctor Kyle', A_CLUSTER_THERAPISTS)
    expect(result).toBe('id-kyle')
  })
})

// ── Prompt must instruct LLM to return null when uncertain ────────────────────
// H1 root cause: the prompt said "Pick the closest" with no null escape.
// These tests verify the prompt text contains the "return null if uncertain"
// instruction — the contract that prevents forced guessing.

describe('matchTherapist — prompt contains null-if-uncertain instruction', () => {
  beforeEach(() => mockGenerateText.mockClear())

  it('prompt tells LLM to return null when match is not unambiguous', async () => {
    mockGenerateText.mockResolvedValueOnce({
      output: { therapist_id: 'id-alex' },
    } as Awaited<ReturnType<typeof generateText>>)

    await matchTherapist('Alex', A_CLUSTER_THERAPISTS)

    expect(mockGenerateText).toHaveBeenCalledOnce()
    const callArg = mockGenerateText.mock.calls[0]![0] as { prompt: string }
    // The prompt MUST contain an explicit null escape instruction.
    // If this fails, the LLM is forced to guess — which is the root cause of the bug.
    expect(callArg.prompt).toContain('null')
    expect(callArg.prompt.toLowerCase()).toContain('unambiguous')
  })
})

// ── Schema allows null: LLM output {therapist_id: null} must return null ──────
// H1 root cause: z.string() (non-nullable) caused Zod.parse to throw on null,
// which was caught and returned null — but only as a side effect of the throw.
// After the fix (z.string().nullable()), the schema must explicitly accept null
// and the function must return null without going through the catch path.

describe('matchTherapist — nullable schema: null output propagates cleanly', () => {
  beforeEach(() => mockGenerateText.mockClear())

  it('returns null when LLM output is {therapist_id: null} for unknown name "Bob"', async () => {
    mockGenerateText.mockResolvedValueOnce({
      output: { therapist_id: null },
    } as Awaited<ReturnType<typeof generateText>>)

    const result = await matchTherapist('Bob', A_CLUSTER_THERAPISTS)
    expect(result).toBeNull()
  })

  it('returns null when LLM output is {therapist_id: null} for meaningless syllable "um"', async () => {
    mockGenerateText.mockResolvedValueOnce({
      output: { therapist_id: null },
    } as Awaited<ReturnType<typeof generateText>>)

    const result = await matchTherapist('um', A_CLUSTER_THERAPISTS)
    expect(result).toBeNull()
  })

  it('returns null for whitespace-only transcript without calling LLM', async () => {
    const result = await matchTherapist('   ', A_CLUSTER_THERAPISTS)
    expect(result).toBeNull()
    expect(mockGenerateText).not.toHaveBeenCalled()
  })
})

