import { generateText, Output } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'

export interface TherapistInput {
  id: string
  name: string
  role: string
}

const MatchSchema = z.object({
  therapist_id: z.string().nullable(),
})

/**
 * Match a raw voice transcript to the closest therapist in the list.
 *
 * Fast-path rules (no LLM call):
 *   - empty transcript  → null
 *   - empty list        → null
 *   - single therapist  → return their id directly
 *
 * Safety guard: if LLM returns an id not in the list, return null.
 * Network / LLM failure: catch and return null (caller surfaces error to UI).
 */
export async function matchTherapist(
  transcript: string,
  therapists: TherapistInput[],
): Promise<string | null> {
  if (!transcript.trim()) return null
  if (therapists.length === 0) return null
  if (therapists.length === 1) return therapists[0]!.id

  const therapistList = therapists
    .map((t) => `  - id: "${t.id}", name: "${t.name}"`)
    .join('\n')

  try {
    const { output } = await generateText({
      model: anthropic('claude-haiku-4-5'),
      output: Output.object({ schema: MatchSchema }),
      prompt: `You are matching a voice transcript to a therapist name.

Therapists:
${therapistList}

Voice transcript: "${transcript}"

Rules:
- Only return an id when the match is unambiguous.
- Handle phonetic variants (e.g. "Cathy" matches "Kathy"), partial first names (e.g. "David" matches "David Wang"), and informal titles (e.g. "Doctor Wang" matches a therapist with last name "Wang").
- If the transcript does not clearly match any therapist name, return null for therapist_id. Do not guess. Ambiguous, partial, or unclear audio must return null.
- If multiple therapists are equally likely, return null — do not pick arbitrarily.`,
    })

    const parsed = MatchSchema.parse(output)
    // Safety guard: LLM must return an id that actually exists in the list
    const valid = therapists.some((t) => t.id === parsed.therapist_id)
    return valid ? parsed.therapist_id : null
  } catch {
    return null
  }
}
