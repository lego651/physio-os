import { generateText, Output } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { IntakeFieldsSchema, type IntakeFields } from '@physio-os/shared'
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

Transcript:
"""
${transcript}
"""

Return the structured JSON object.`,
  })

  const fields = IntakeFieldsSchema.parse(output)

  const warnings: string[] = []
  if (fields.patient_name === 'Unknown Patient') warnings.push('patient_name could not be extracted')

  console.log('[extract] extraction complete', { warnings })
  return { fields, warnings }
}
