/**
 * Whisper language guard — Bug M (2026-05-23)
 *
 * Problem: Whisper's language='en' hint is not a hard constraint. For very short
 * or phonetically ambiguous audio (e.g. a 1-2 s English name like "Cathy Liu"),
 * Whisper sometimes detects another language and outputs non-Latin characters
 * (e.g. "开肺瘤" instead of the intended English name).
 *
 * Guard: isNonEnglishScript() checks that the transcript contains only ASCII
 * printable characters + common Latin-1 Extended accented letters (é, ñ, ü…).
 * Any CJK, Cyrillic, Arabic, Hebrew, Devanagari, or other non-Latin-script
 * character causes this to return true.
 *
 * Scope: applied to ALL intake steps (1–4) in upload/route.ts, AFTER the K2/K3
 * hallucination guards, BEFORE any Claude processing.
 */

/**
 * Unicode ranges that are allowed in English clinic speech transcripts.
 *
 * Allow:
 *   - U+0020–U+007E : ASCII printable (letters, digits, punctuation, space)
 *   - U+00C0–U+00FF : Latin-1 Supplement (accented letters: é, ñ, ü, ç, etc.)
 *   - U+0100–U+017F : Latin Extended-A (ā, ę, etc. — appear in some proper names)
 *   - U+0180–U+024F : Latin Extended-B (additional Latin letters)
 *   - U+02B0–U+02FF : Spacing Modifier Letters (e.g. ʼ apostrophe variants)
 *   - U+2018–U+2019 : Curly single quotes (common in Whisper output)
 *   - U+201C–U+201D : Curly double quotes
 *   - U+2026       : Ellipsis …
 *   - U+2013–U+2014 : En dash, em dash
 */
const ALLOWED_SCRIPT_REGEX =
  /^[ -~À-ɏʰ-˿–—‘’“”…\r\n\t]*$/

/**
 * Returns true if the transcript contains characters outside the Latin/ASCII
 * range — i.e. it appears to be in a non-English script.
 *
 * Examples:
 *   isNonEnglishScript("Cathy Liu")   → false  (pure ASCII — allowed)
 *   isNonEnglishScript("José García") → false  (Latin-1 accents — allowed)
 *   isNonEnglishScript("开肺瘤")       → true   (CJK — blocked)
 *   isNonEnglishScript("Привет")      → true   (Cyrillic — blocked)
 *   isNonEnglishScript("مرحبا")       → true   (Arabic — blocked)
 */
export function isNonEnglishScript(text: string): boolean {
  return !ALLOWED_SCRIPT_REGEX.test(text)
}
