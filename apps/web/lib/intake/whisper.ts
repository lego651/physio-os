import { experimental_transcribe as transcribe } from 'ai'
import { openai } from '@ai-sdk/openai'

/**
 * Transcribe an audio buffer using OpenAI Whisper via the AI SDK.
 * OPENAI_API_KEY must be set in environment — the @ai-sdk/openai provider
 * picks it up automatically.
 *
 * @param audioBuffer - Raw audio bytes (ogg, webm, mp4, m4a accepted by Whisper)
 * @param filename - Filename with extension, e.g. "voice.ogg" — for logging only
 * @returns Transcript string, or throws on API error
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  filename: string,
): Promise<string> {
  console.log('[whisper] transcription started', { filename, bytes: audioBuffer.length })

  const { text } = await transcribe({
    model: openai.transcription('whisper-1'),
    audio: audioBuffer,
    providerOptions: {
      openai: { language: 'en' },
    },
  })

  console.log('[whisper] transcription complete', { chars: text.length })
  return text
}
