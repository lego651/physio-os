import { generateText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'

/**
 * Clean a raw Whisper STT transcript of a patient name.
 *
 * Whisper is trained on continuous speech. When the audio is a short, isolated
 * English name (~1-2 s), it often mistranscribes by phonetic syllable matching
 * rather than English name recognition — e.g. "Cathy Liu" → "Chai Siu Liu".
 *
 * This function passes the raw transcript to Claude Haiku which can pattern-match
 * phonetic variants back to the most likely original English name.
 *
 * Fast-path: transcripts shorter than 2 chars skip the LLM entirely.
 * Fail-safe: if the LLM call throws, the raw transcript is returned unchanged.
 *
 * @param rawTranscript - The raw string returned by Whisper for step=1 (patient name)
 * @returns { name: cleaned name, raw: original Whisper output }
 */
export async function cleanPatientName(
  rawTranscript: string,
): Promise<{ name: string; raw: string }> {
  // L4: fast-path — skip LLM for empty or single-char input
  if (rawTranscript.trim().length < 2) {
    return { name: rawTranscript, raw: rawTranscript }
  }

  try {
    const { text } = await generateText({
      model: anthropic('claude-haiku-4-5'),
      prompt: `You are helping clean a Whisper STT transcript of a person's English name.

The transcript may contain phonetic errors — Whisper often mistranscribes isolated English names by their syllable sounds.

Few-shot examples:
- "Chai Siu Liu" → "Cathy Liu"   (Whisper read syllables phonetically instead of the English name)
- "Cassie Lou" → "Cathy Liu"     (another phonetic variant of the same name)
- "Kathy Lou" → "Kathy Lou"      (already a plausible English name — return unchanged)
- "John Smith" → "John Smith"    (clean input — return unchanged)
- "Wai Chung Wong" → "Wai Chung Wong"  (legitimate Chinese-English name spelling — do not alter)
- "Mary Catherine Elizabeth Jones" → "Mary Catherine Elizabeth Jones"  (long name — preserve as-is)

Rules:
- Return the most likely original English name spoken.
- If the transcript is already a plausible English name, return it unchanged.
- Do NOT compress or shorten long names.
- Do NOT alter legitimate Chinese-English name spellings (e.g. "Wai Chung Wong", "Xiao Ming Li").
- If you genuinely cannot determine the intended name, return the raw transcript verbatim.
- Return ONLY the name. No explanation, no punctuation beyond what is in the name itself.

Transcript: "${rawTranscript}"`,
    })

    const cleaned = (text ?? '').trim()
    // If Claude returns empty for any reason, fall back to raw
    return { name: cleaned.length > 0 ? cleaned : rawTranscript, raw: rawTranscript }
  } catch {
    // L5: fail-safe — LLM failure must not break the intake flow
    console.error('[clean-patient-name] Claude call failed, falling back to raw transcript', {
      rawTranscript,
    })
    return { name: rawTranscript, raw: rawTranscript }
  }
}
