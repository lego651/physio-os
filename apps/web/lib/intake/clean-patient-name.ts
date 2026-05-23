import { generateText, Output } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'

const NameSchema = z.object({ name: z.string() })

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
 * Uses generateText + Output.object (structured output) so Claude cannot return
 * explanation prose — the SDK enforces the { name: string } schema and
 * re-prompts until valid. Matches the pattern used by match-therapist.ts.
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
    const { output } = await generateText({
      model: anthropic('claude-haiku-4-5'),
      output: Output.object({ schema: NameSchema }),
      prompt: `You are helping clean a Whisper STT transcript of a person's English name.

The transcript may contain phonetic errors — Whisper often mistranscribes isolated English names by their syllable sounds.

Few-shot examples:
- "Chai Siu Liu"   → { "name": "Cathy Liu" }    (Whisper read syllables phonetically instead of the English name)
- "Cassie Lou"     → { "name": "Cathy Liu" }    (another phonetic variant of the same name)
- "Kathy Lou"      → { "name": "Kathy Lou" }    (already a plausible English name — return unchanged)
- "John Smith"     → { "name": "John Smith" }   (clean input — return unchanged)
- "Wai Chung Wong" → { "name": "Wai Chung Wong" }  (legitimate Chinese-English name spelling — do not alter)
- "Mary Catherine Elizabeth Jones" → { "name": "Mary Catherine Elizabeth Jones" }  (long name — preserve as-is)
- "开肺瘤"          → { "name": "开肺瘤" }       (non-Latin characters — return verbatim, do not explain)
- ""               → { "name": "" }             (empty — return empty)
- "   "            → { "name": "   " }          (whitespace — return verbatim)

Rules:
- Return the most likely original English name spoken.
- If the transcript is already a plausible English name, return it unchanged.
- Do NOT compress or shorten long names.
- Do NOT alter legitimate Chinese-English name spellings (e.g. "Wai Chung Wong", "Xiao Ming Li").
- If the transcript contains non-Latin characters or is not a plausible English name (e.g. it is a phrase, a sentence, or in a non-Latin script), return it VERBATIM in the name field. Do NOT explain. Do NOT refuse. Do NOT write prose.

Transcript: "${rawTranscript}"`,
    })

    const parsed = NameSchema.parse(output)
    const cleaned = (parsed.name ?? '').trim()
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
