import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockTranscribe = vi.fn().mockResolvedValue({ text: 'hello' })
vi.mock('ai', () => ({ experimental_transcribe: mockTranscribe }))
vi.mock('@ai-sdk/openai', () => ({
  openai: {
    transcription: vi.fn().mockReturnValue('mocked-model'),
  },
}))

beforeEach(() => {
  mockTranscribe.mockClear()
})

describe('transcribeAudio — D16-8 provider options', () => {
  it('passes language: "en" to providerOptions for staff-side English accuracy', async () => {
    const { transcribeAudio } = await import('../whisper')
    await transcribeAudio(Buffer.from(new Uint8Array(10)), 'test.webm')
    const call = mockTranscribe.mock.calls[0][0]
    expect(call.providerOptions?.openai?.language).toBe('en')
  })

  it('passes a prompt containing physiotherapy terms including "RMT"', async () => {
    const { transcribeAudio } = await import('../whisper')
    await transcribeAudio(Buffer.from(new Uint8Array(10)), 'test.webm')
    const call = mockTranscribe.mock.calls[0][0]
    expect(typeof call.providerOptions?.openai?.prompt).toBe('string')
    expect(call.providerOptions.openai.prompt).toContain('RMT')
  })

  // Bug G: prompt must NOT contain example names or "Chinese-Canadian" language hint.
  // When audio is short/ambiguous, Whisper treats the prompt as a preceding transcript
  // and can output prompt text verbatim instead of decoding the audio.
  it('prompt does NOT contain "Chinese-Canadian" (prevents prompt leaking as transcription)', async () => {
    const { transcribeAudio } = await import('../whisper')
    await transcribeAudio(Buffer.from(new Uint8Array(10)), 'test.webm')
    const call = mockTranscribe.mock.calls[0][0]
    const prompt: string = call.providerOptions?.openai?.prompt ?? ''
    expect(prompt).not.toContain('Chinese-Canadian')
    expect(prompt).not.toContain('e.g.,')
    expect(prompt).not.toContain('Cathy')
    expect(prompt).not.toContain('Wei Zhang')
    expect(prompt).not.toContain('Emily Chen')
    expect(prompt).not.toContain('David Wang')
    expect(prompt).not.toContain('Kevin Lin')
  })

  it('throws EmptyTranscriptError on empty buffer', async () => {
    const { transcribeAudio, EmptyTranscriptError } = await import('../whisper')
    await expect(transcribeAudio(Buffer.alloc(0), 'empty.webm')).rejects.toBeInstanceOf(
      EmptyTranscriptError,
    )
  })
})
