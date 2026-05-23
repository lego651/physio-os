import type { SessionType } from '@physio-os/shared'

/**
 * Build the display text for the STEP_2_TREATMENT chat bubble.
 *
 * Rules:
 * - session_type 'other': surface raw transcript so operator can see what was heard.
 * - area 'unspecified': show only service (omit area).
 * - both known: "service — area" (e.g. "massage — right shoulder").
 */
export function formatTreatmentBubble(
  area: string,
  sessionType: SessionType,
  transcript: string,
): string {
  if (sessionType === 'other') {
    return transcript || area
  }
  if (!area || area === 'unspecified') {
    return sessionType
  }
  return `${sessionType} — ${area}`
}
