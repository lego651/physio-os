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
  it('does NOT pass language to providerOptions', async () => {
    const { transcribeAudio } = await import('../whisper')
    await transcribeAudio(Buffer.from(new Uint8Array(10)), 'test.webm')
    const call = mockTranscribe.mock.calls[0][0]
    expect(call.providerOptions?.openai?.language).toBeUndefined()
  })

  it('passes a prompt containing physiotherapy terms including "RMT"', async () => {
    const { transcribeAudio } = await import('../whisper')
    await transcribeAudio(Buffer.from(new Uint8Array(10)), 'test.webm')
    const call = mockTranscribe.mock.calls[0][0]
    expect(typeof call.providerOptions?.openai?.prompt).toBe('string')
    expect(call.providerOptions.openai.prompt).toContain('RMT')
  })

  it('throws EmptyTranscriptError on empty buffer', async () => {
    const { transcribeAudio, EmptyTranscriptError } = await import('../whisper')
    await expect(transcribeAudio(Buffer.alloc(0), 'empty.webm')).rejects.toBeInstanceOf(
      EmptyTranscriptError,
    )
  })
})
