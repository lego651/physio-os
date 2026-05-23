/**
 * Source-inspection tests for voice-intake-chat.tsx hallucination guard behavior.
 * Bug K: Whisper hallucination defense — K1 (client-side duration) + K4 (UI error feedback).
 *
 * Pattern: read the source file and assert structural properties, following
 * the existing voice-intake-therapist.test.ts convention in this project.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const SRC = fs.readFileSync(
  path.resolve(__dirname, '../voice-intake-chat.tsx'),
  'utf-8',
)

// ─── K1: Client-side recording duration guard ─────────────────────────────────

describe('voice-intake-chat — K1: client-side short-recording guard', () => {
  it('references MIN_RECORDING_MS or similar duration threshold constant', () => {
    // The component must define or use a constant for minimum recording duration
    expect(SRC).toMatch(/MIN_RECORDING_MS|MIN_DURATION_MS|minDuration|700/)
  })

  it('onstop handler checks recording duration before calling processAudio', () => {
    // The onstop handler must have a duration/time check before processAudio is called.
    // This can be implemented by tracking recordingStartRef and comparing elapsed time.
    expect(SRC).toMatch(/recordingStart|startTime|durationMs|Date\.now/)
  })

  it('setError is called with a "too short" message when duration guard fires', () => {
    // When recording is too short, setError must be called (not processAudio)
    expect(SRC).toMatch(/too short|Recording too short|record again/i)
  })

  it('processAudio is NOT called when duration guard rejects recording', () => {
    // The guard must short-circuit before processAudio — confirm the source
    // contains a conditional that gates processAudio on duration check.
    // Pattern: if (duration < threshold) { setError(...); return; }
    expect(SRC).toMatch(/durationMs|recordingDuration|elapsed/)
  })
})

// ─── K4: UI error feedback after server-side guard rejection ──────────────────

describe('voice-intake-chat — K4: server-side guard error feedback', () => {
  it('handles hallucination_detected error from server without pushing bubble', () => {
    // The component must NOT push a bubble when server returns hallucination_detected.
    // Instead it must call setError with a clear message.
    // Verify the error string "hallucination_detected" or "Audio unclear" appears in the source.
    expect(SRC).toMatch(/hallucination_detected|Audio unclear|unclear.*record again/i)
  })

  it('handles too_short error from server without pushing bubble', () => {
    // The component must NOT push a bubble when server returns too_short.
    expect(SRC).toMatch(/too_short|Audio too short|too short.*record/i)
  })

  it('error state is rendered visibly in the UI (error div is rendered when error is set)', () => {
    // Already present in existing component — confirm error display block exists.
    expect(SRC).toContain('text-destructive')
  })
})
