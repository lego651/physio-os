/**
 * Whisper hallucination guard — Bug K (2026-05-23)
 *
 * Whisper-1 is trained on YouTube-heavy data. Short or silent audio causes it
 * to fall back to common outro phrases ("Thank you for watching!", etc.).
 *
 * Two guards:
 *   isHallucination(text) — K2: matches known hallucination phrases
 *   isTooShort(text)      — K3: catches single-char/empty Whisper outputs
 *
 * False-positive protection (failure mode #5):
 *   isHallucination returns false for any text longer than 60 chars after trim.
 *   Whisper hallucinations are always short, standalone phrases.
 *   Legitimate transcripts that happen to contain a blacklist term
 *   (e.g. "the patient subscribed to the home exercise program…") will be
 *   long enough to clear the length gate and pass through.
 */

const HALLUCINATION_PHRASES = [
  'thank you for watching',
  'thanks for watching',
  "don't forget to subscribe",
  'please subscribe',
  'like and subscribe',
  'subscribe to my channel',
  'see you next time',
  'see you in the next video',
  '♪',
  '[music]',
  '[applause]',
  '[laughter]',
]

/** Maximum length of a text still eligible for hallucination phrase matching. */
const MAX_HALLUCINATION_LENGTH = 60

/**
 * Returns true if the transcript looks like a Whisper hallucination.
 * Never returns true for texts longer than MAX_HALLUCINATION_LENGTH chars
 * (length gate prevents false positives on real speech).
 */
export function isHallucination(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed.length > MAX_HALLUCINATION_LENGTH) return false
  const lower = trimmed.toLowerCase()
  return HALLUCINATION_PHRASES.some((phrase) => lower.includes(phrase))
}

/**
 * Returns true if the transcript is too short to be real speech.
 * Whisper sometimes returns "." or " " on silent audio.
 * Threshold: < 2 characters after trim.
 */
export function isTooShort(text: string): boolean {
  return text.trim().length < 2
}
