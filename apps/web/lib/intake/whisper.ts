import { experimental_transcribe as transcribe } from 'ai'
import { openai } from '@ai-sdk/openai'

export class EmptyTranscriptError extends Error {
  readonly reason: 'empty_audio' | 'silent_audio'
  constructor(reason: 'empty_audio' | 'silent_audio') {
    super(
      `[whisper] ${reason === 'empty_audio' ? 'empty audio buffer' : 'empty transcript — audio may be silent or corrupted'}`,
    )
    this.name = 'EmptyTranscriptError'
    this.reason = reason
  }
}

/**
 * Transcribe an audio buffer using OpenAI Whisper via the AI SDK.
 * OPENAI_API_KEY must be set in environment — the @ai-sdk/openai provider
 * picks it up automatically.
 *
 * @param audioBuffer - Raw audio bytes (ogg, webm, mp4, m4a accepted by Whisper)
 * @param filename - Filename with extension, e.g. "voice.ogg" — for logging only
 * @returns Transcript string, or throws on API error
 */
export async function transcribeAudio(audioBuffer: Buffer, filename: string): Promise<string> {
  if (audioBuffer.length === 0) {
    throw new EmptyTranscriptError('empty_audio')
  }

  console.log('[whisper] transcription started', { filename, bytes: audioBuffer.length })

  const { text } = await transcribe({
    model: openai.transcription('whisper-1'),
    audio: audioBuffer,
    providerOptions: {
      openai: {
        // language: 'en' locks Whisper-1 to English decoding.
        // Without this, auto-detection misreads short English names (e.g. "Jason" → "Jai Shen.")
        // Staff-side voice intake is English-only (D16-8 updated 2026-05-22).
        language: 'en',
        prompt:
          'Physiotherapy session note in English. ' +
          'Patient names and therapist names are English or common Canadian names. ' +
          'Terms may include: RMT, OMT, TCM, acupuncture, acupuncture needles, cupping, ' +
          'massage therapy, deep tissue, Swedish, osteopathic, physiotherapy, rehabilitation, ' +
          'cervical, lumbar, rotator cuff, fascia, trigger point, IASTM, chiropractic, adjustment. ' +
          'Patient names and therapist names may be Chinese-Canadian, e.g., Cathy Liu, Wei Zhang, Emily Chen, David Wang, Kevin Lin. Transcribe proper nouns carefully.',
      },
    },
  })

  if (!text || text.trim().length === 0) {
    throw new EmptyTranscriptError('silent_audio')
  }

  console.log('[whisper] transcription complete', { chars: text.length })
  return text
}
