import { tool } from 'ai'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@physio-os/shared'

/**
 * Factory that returns a server-executed log_metrics tool with the Supabase
 * client and patient context closed over.  This pattern is necessary because
 * the Vercel AI SDK tool execute function does not natively receive caller-
 * supplied context.
 *
 * @param patientId       - UUID of the patient whose metrics are being recorded
 * @param supabase        - Authenticated Supabase client for the current request
 * @param sourceMessageId - Optional UUID of the message that triggered the tool call
 */
export function createLogMetricsTool(
  patientId: string,
  supabase: SupabaseClient<Database>,
  sourceMessageId?: string,
) {
  return tool({
    description:
      'Log patient recovery metrics extracted from the conversation. Call this whenever the patient mentions pain levels, discomfort, sitting tolerance, or exercises completed. The tool persists the data to the database and returns a confirmation string.',
    inputSchema: z.object({
      pain_level: z
        .number()
        .min(1)
        .max(10)
        .optional()
        .describe('Pain level on a scale of 1-10'),
      discomfort: z
        .number()
        .min(0)
        .max(3)
        .optional()
        .describe('Discomfort on a scale of 0-3'),
      sitting_tolerance_min: z
        .number()
        .min(0)
        .optional()
        .describe('How long the patient can sit comfortably in minutes'),
      exercises_done: z
        .array(z.string())
        .optional()
        .describe('List of exercise names the patient completed'),
      notes: z.string().optional().describe('Additional context or notes'),
    }),
    execute: async ({ pain_level, discomfort, sitting_tolerance_min, exercises_done, notes }) => {
      const { error } = await supabase.from('metrics').insert({
        patient_id: patientId,
        pain_level: pain_level ?? null,
        discomfort: discomfort ?? null,
        sitting_tolerance_min: sitting_tolerance_min ?? null,
        exercises_done: exercises_done ?? null,
        exercise_count: exercises_done != null ? exercises_done.length : null,
        notes: notes ?? null,
        source_message_id: sourceMessageId ?? null,
      })

      if (error) {
        throw new Error(`Failed to log metrics: ${error.message}`)
      }

      return buildConfirmation({ pain_level, discomfort, sitting_tolerance_min, exercises_done, notes })
    },
  })
}

interface ConfirmationParams {
  pain_level?: number
  discomfort?: number
  sitting_tolerance_min?: number
  exercises_done?: string[]
  notes?: string
}

/**
 * Builds a human-readable confirmation string from the recorded fields.
 * Only fields that were actually provided are included.
 */
function buildConfirmation({
  pain_level,
  discomfort,
  sitting_tolerance_min,
  exercises_done,
  notes,
}: ConfirmationParams): string {
  const parts: string[] = []

  if (pain_level != null) parts.push(`pain ${pain_level}/10`)
  if (discomfort != null) parts.push(`discomfort ${discomfort}`)
  if (sitting_tolerance_min != null) parts.push(`sitting tolerance ${sitting_tolerance_min} min`)
  if (exercises_done != null && exercises_done.length > 0) {
    parts.push(`exercises: ${exercises_done.join(', ')}`)
  }
  if (notes) parts.push(`notes: ${notes}`)

  if (parts.length === 0) return 'Recorded: (no metrics provided)'
  return `Recorded: ${parts.join(', ')}`
}
