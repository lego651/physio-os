import { generateText, Output } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'
import { IntakeFieldsSchema, SessionTypeSchema, type IntakeFields } from '@physio-os/shared'
import { requireEnv } from '@/lib/env'

const today = () => new Date().toISOString().slice(0, 10)

/**
 * Extract structured 5-field intake data from a raw voice transcript.
 * Uses Claude via the Vercel AI SDK v6: generateText() + Output.object().
 */
export async function extractIntakeFields(transcript: string): Promise<{
  fields: IntakeFields
  warnings: string[]
}> {
  requireEnv('ANTHROPIC_API_KEY')

  console.log('[extract] starting field extraction', { transcriptChars: transcript.length })

  const { output } = await generateText({
    model: anthropic('claude-sonnet-4-5'),
    output: Output.object({ schema: IntakeFieldsSchema }),
    prompt: `You are a medical scribe assistant for a physiotherapy clinic.

Extract structured intake data from the following therapist voice note transcript.

Rules:
- patient_name: The patient's full name as spoken. If unclear, use "Unknown Patient".
- date_of_visit: Today's date in YYYY-MM-DD format unless a specific date is mentioned. Today is ${today()}.
- therapist_name: The therapist's name if mentioned, otherwise use "David".
- treatment_area: The body area treated (e.g., "lower back", "right shoulder", "knee"). Short phrase.
- session_notes: A clean, complete summary of what was done during the session. Keep clinical detail. Max 500 words.
- Output all fields in English, even if the transcript is in another language.
  Translate naturally; do not transliterate.

Transcript:
"""
${transcript}
"""

Return the structured JSON object.`,
  })

  const fields = IntakeFieldsSchema.parse(output)

  const warnings: string[] = []
  if (fields.patient_name === 'Unknown Patient')
    warnings.push('patient_name could not be extracted')

  console.log('[extract] extraction complete', { warnings })
  return { fields, warnings }
}

export type SingleFieldName = 'treatment_area' | 'session_notes'

/**
 * Extract a single field from a short voice transcript.
 * Returns the extracted English string directly (no warnings wrapper).
 */
export async function extractSingleField(
  transcript: string,
  field: SingleFieldName,
): Promise<string> {
  requireEnv('ANTHROPIC_API_KEY')

  const fieldInstructions: Record<SingleFieldName, string> = {
    treatment_area:
      'Extract the body area being treated (e.g., "lower back", "right knee", "left shoulder"). ' +
      'Return a short phrase. If unclear, return "unspecified".',
    session_notes:
      'Produce a clean clinical summary of the session notes. Keep clinical detail. Max 500 words. ' +
      'If unclear, return "No notes recorded".',
  }

  console.log('[extract] single-field extraction', { field, transcriptChars: transcript.length })

  const { text } = await generateText({
    model: anthropic('claude-sonnet-4-5'),
    prompt: `You are a medical scribe assistant for a physiotherapy clinic.

The therapist just dictated the following voice note for a single field: "${field}".

Instructions: ${fieldInstructions[field]}

Rule: Output the field value in English only, even if the transcript is in another language. Translate naturally; do not transliterate.

Transcript:
"""
${transcript}
"""

Return ONLY the field value string. No JSON, no labels, no extra text.`,
  })

  const result =
    (text ?? '').trim() || (field === 'treatment_area' ? 'unspecified' : 'No notes recorded')
  console.log('[extract] single-field complete', { field, resultChars: result.length })
  return result
}

const TreatmentStepSchema = z.object({
  treatment_area: z.string().min(1),
  session_type: SessionTypeSchema,
})

export type TreatmentStepOutput = z.infer<typeof TreatmentStepSchema>

/**
 * Step 2 extractor: returns both treatment_area and session_type from
 * a single therapist voice answer ("deep tissue massage on right shoulder").
 *
 * Classification rules (D18-1):
 *   massage      — massage, RMT, deep tissue, Swedish, relaxation
 *   physio       — physio, physiotherapy, rehabilitation, stretching, mobility, strengthening, exercise
 *   acupuncture  — acupuncture, TCM, needles, cupping
 *   chiropractor — chiro, chiropractic, adjustment, manipulation
 *   other        — ambiguous or unrecognized
 */
export async function extractTreatmentStep(transcript: string): Promise<TreatmentStepOutput> {
  requireEnv('ANTHROPIC_API_KEY')

  console.log('[extract] treatment-step extraction', { transcriptChars: transcript.length })

  const { output } = await generateText({
    model: anthropic('claude-sonnet-4-5'),
    output: Output.object({ schema: TreatmentStepSchema }),
    prompt: `You are a medical scribe assistant for a physiotherapy clinic.

The therapist just dictated what treatment they did. Extract two fields:

1. treatment_area: The body area treated. Short phrase, e.g. "lower back", "right shoulder", "knee". If unclear, "unspecified".

2. session_type: One of exactly: 'massage', 'physio', 'acupuncture', 'chiropractor', 'other'.
   Classification rules:
   - 'massage'      → massage, RMT, deep tissue, Swedish, relaxation, soft tissue
   - 'physio'       → physio, physiotherapy, rehabilitation, stretching, mobility, strengthening, exercise, IMS
   - 'acupuncture'  → acupuncture, acupuncture needles, TCM, traditional Chinese medicine, needles, cupping, dry needling
   - 'chiropractor' → chiro, chiropractic, adjustment, manipulation, spinal adjustment
   - Ambiguous or unrecognized service → 'other' (only if nothing above applies)

   IMPORTANT: Never default to 'other' if the transcript contains a recognizable service name.
   Whisper transcription may contain minor spelling variations — use best judgment:
   e.g. "accupuncture", "acupunture", "aculpuncture" → all map to 'acupuncture'.

Few-shot examples:
- "acupuncture on the lower back" → treatment_area: "lower back", session_type: "acupuncture"
- "deep tissue massage right shoulder" → treatment_area: "right shoulder", session_type: "massage"
- "physiotherapy knee rehab" → treatment_area: "knee", session_type: "physio"
- "chiropractic adjustment cervical spine" → treatment_area: "cervical spine", session_type: "chiropractor"
- "cupping therapy upper back" → treatment_area: "upper back", session_type: "acupuncture"
- "RMT lower back" → treatment_area: "lower back", session_type: "massage"

Rule: Output all fields in English, even if the transcript is in another language. Translate naturally; do not transliterate.

Transcript:
"""
${transcript}
"""

Return the structured JSON object.`,
  })

  const parsed = TreatmentStepSchema.parse(output)
  console.log('[extract] treatment-step complete', {
    area: parsed.treatment_area,
    type: parsed.session_type,
  })
  return parsed
}
