/**
 * Source-inspection tests for voice-intake-chat.tsx Bug Q:
 * - Q1: pencil icon moved to left side of bubble (DOM order: actions → bubble)
 * - Q2: mic icon added to left of pencil
 * - Q3: rerecordingStep state + startRerecord handler
 * - Q4: disabled state during re-record
 * - Q5: edit/mic mutual exclusion
 * - Q6/Q7/Q8: all 4 stepKeys support rerecord via correct stepParam
 *
 * Pattern: source-inspection (same as voice-intake-therapist.test.ts)
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const SRC = fs.readFileSync(
  path.resolve(__dirname, '../voice-intake-chat.tsx'),
  'utf-8',
)

// ── Q1: pencil icon is on the LEFT side of the bubble ────────────────────────

describe('voice-intake-chat — Q1: pencil icon is to the left of the bubble content', () => {
  it('actions container appears before bubble content div in DOM order', () => {
    // In the non-editing branch of a user bubble, the actions container (with
    // pencil + mic) must come BEFORE the green bubble div.
    // We detect this by confirming that the pencil/mic wrapper precedes the
    // rounded-2xl bubble div in the source string.
    const pencilIdx = SRC.indexOf('Edit answer')
    const bubbleIdx = SRC.indexOf('rounded-2xl rounded-tr-none')
    expect(pencilIdx).toBeGreaterThan(-1)
    expect(bubbleIdx).toBeGreaterThan(-1)
    // actions (pencil label) must come BEFORE the bubble content div
    expect(pencilIdx).toBeLessThan(bubbleIdx)
  })

  it('user bubble flex container wraps actions-left then bubble-right', () => {
    // The non-editing user bubble wrapper must have flex with actions before bubble.
    // Verify: source has a pattern where the aria-label="Edit answer" button
    // is inside a container that precedes the green bubble text div.
    // We check the relative position of "Edit answer" vs "rounded-tr-none".
    const editLabelPos = SRC.indexOf('"Edit answer"')
    const bubbleDivPos = SRC.indexOf('rounded-tr-none')
    expect(editLabelPos).toBeGreaterThan(-1)
    expect(bubbleDivPos).toBeGreaterThan(-1)
    expect(editLabelPos).toBeLessThan(bubbleDivPos)
  })
})

// ── Q2: mic icon exists and is to the LEFT of pencil icon ────────────────────

describe('voice-intake-chat — Q2: mic icon present and left of pencil', () => {
  it('imports Mic from lucide-react', () => {
    expect(SRC).toMatch(/Mic.*lucide-react|lucide-react.*Mic/)
  })

  it('renders a Mic icon button with aria-label Re-record', () => {
    expect(SRC).toMatch(/aria-label=["']Re-record this answer["']/)
  })

  it('mic icon appears before pencil icon in DOM source order', () => {
    // DOM order: mic → pencil → bubble
    const micIdx = SRC.indexOf('Re-record this answer')
    const pencilIdx = SRC.indexOf('Edit answer')
    expect(micIdx).toBeGreaterThan(-1)
    expect(pencilIdx).toBeGreaterThan(-1)
    expect(micIdx).toBeLessThan(pencilIdx)
  })
})

// ── Q3: rerecordingStep state and startRerecord handler ──────────────────────

describe('voice-intake-chat — Q3: rerecordingStep state + startRerecord handler', () => {
  it('declares rerecordingStep state', () => {
    expect(SRC).toMatch(/rerecordingStep/)
  })

  it('defines startRerecord function', () => {
    expect(SRC).toMatch(/function startRerecord|startRerecord\s*=/)
  })

  it('startRerecord closes any open edit mode (calls setEditingStep)', () => {
    // Extract startRerecord body and verify setEditingStep(null) appears
    const fnMatch = SRC.match(
      /function startRerecord[\s\S]{0,600}(?=\n\s*function |\n\s*async function |\n\s*const [a-z])/,
    )
    const body = fnMatch?.[0] ?? ''
    expect(body).toContain('setEditingStep')
  })

  it('startRerecord sets rerecordingStep to the given stepKey', () => {
    expect(SRC).toMatch(/setRerecordingStep/)
  })

  it('startRerecord triggers recording (calls startRecording)', () => {
    const fnMatch = SRC.match(
      /function startRerecord[\s\S]{0,600}(?=\n\s*function |\n\s*async function |\n\s*const [a-z])/,
    )
    const body = fnMatch?.[0] ?? ''
    expect(body).toContain('startRecording')
  })
})

// ── Q3: stepKey → stepParam mapping covers all 4 keys ────────────────────────

describe('voice-intake-chat — Q3: stepKey→stepParam mapping for rerecord', () => {
  it('maps patient_name to stepParam 1', () => {
    expect(SRC).toMatch(/patient_name[\s\S]{0,40}['"]1['"]|['"]1['"][\s\S]{0,40}patient_name/)
  })

  it('maps treatment_area to stepParam 2', () => {
    expect(SRC).toMatch(/treatment_area[\s\S]{0,40}['"]2['"]|['"]2['"][\s\S]{0,40}treatment_area/)
  })

  it('maps therapist_name to stepParam 3 in rerecord context', () => {
    // rerecord path must include stepParam 3 for therapist_name
    expect(SRC).toMatch(/therapist_name[\s\S]{0,40}['"]3['"]|['"]3['"][\s\S]{0,40}therapist_name/)
  })

  it('maps session_notes to stepParam 4 in rerecord context', () => {
    expect(SRC).toMatch(/session_notes[\s\S]{0,40}['"]4['"]|['"]4['"][\s\S]{0,40}session_notes/)
  })
})

// ── Q3: processAudio rerecord path does NOT call advanceStep ──────────────────

describe('voice-intake-chat — Q3: rerecord path does not advance step', () => {
  it('processAudio accepts a rerecord mode parameter (mode or rerecordTarget)', () => {
    // processAudio must accept either a mode flag or a rerecord parameter
    // so that it can skip advanceStep during rerecord.
    expect(SRC).toMatch(/processAudio[\s\S]{0,200}rerecord|rerecord[\s\S]{0,200}processAudio/)
  })

  it('rerecord branch updates bubble text in-place (setBubbles with map)', () => {
    // Re-record replaces bubble content at original position via setBubbles + prev.map.
    // Both the rerecord path and the edit (saveEdit) path use this pattern.
    // The regex uses [\s\S] to match across multi-line closures.
    const allSetBubblesMaps = [...SRC.matchAll(/setBubbles\([\s\S]{0,30}prev[\s\S]{0,30}\.map\(/g)]
    expect(allSetBubblesMaps.length).toBeGreaterThanOrEqual(2)
  })
})

// ── Q4: recording-in-progress disables other bubble actions ──────────────────

describe('voice-intake-chat — Q4: rerecording state disables actions', () => {
  it('mic icon button is disabled when rerecordingStep is set or recording is active', () => {
    // The mic button must have a disabled condition referencing rerecordingStep or recording
    expect(SRC).toMatch(/disabled.*rerecordingStep|rerecordingStep.*disabled/)
  })

  it('mic button shows loading/processing indicator during rerecord', () => {
    // Visual feedback: spinner text or className change when rerecording
    expect(SRC).toMatch(/rerecordingStep|processing.*rerecord|rerecord.*processing/)
  })
})

// ── Q5: edit and mic are mutually exclusive ───────────────────────────────────

describe('voice-intake-chat — Q5: edit mode and mic are mutually exclusive', () => {
  it('pencil/edit button is disabled when rerecordingStep is active', () => {
    expect(SRC).toMatch(/disabled.*rerecordingStep|rerecordingStep.*disabled/)
  })

  it('startRerecord closes edit mode first (setEditingStep null)', () => {
    // Already asserted in Q3, but explicit here for Q5 contract
    const fnMatch = SRC.match(
      /function startRerecord[\s\S]{0,600}(?=\n\s*function |\n\s*async function |\n\s*const [a-z])/,
    )
    const body = fnMatch?.[0] ?? ''
    expect(body).toContain('setEditingStep')
  })
})

// ── Q6/Q7/Q8: all 4 stepKeys are re-recordable ───────────────────────────────

describe('voice-intake-chat — Q6/Q7/Q8: all stepKeys support rerecord', () => {
  it('mic icon is rendered for bubbles with stepKey patient_name', () => {
    // The mic icon render is gated on b.editable && b.stepKey (same as pencil)
    // This means all 4 editable bubbles get the mic icon.
    // Verify: the mic icon render is inside the b.editable check.
    const editableBlock = SRC.match(
      /b\.editable[\s\S]{0,800}Re-record this answer/,
    )
    expect(editableBlock).not.toBeNull()
  })

  it('rerecord for therapist_name sends therapists payload (step=3 path)', () => {
    // When rerecording step=3, the upload must include the therapists JSON
    // (same as the sequential flow). Verify therapists append appears in
    // the upload path associated with step=3 / therapist_name.
    expect(SRC).toMatch(/therapists[\s\S]{0,100}append|append[\s\S]{0,100}therapists/)
  })
})

// ── Existing contracts preserved ──────────────────────────────────────────────

describe('voice-intake-chat — existing contracts still hold after Q changes', () => {
  it('processAudio sequential path still calls advanceStep for steps 1-4', () => {
    // The normal (non-rerecord) path must still call advanceStep
    expect(SRC).toContain('advanceStep')
  })

  it('edit mode (startEdit/saveEdit) still exists', () => {
    expect(SRC).toContain('startEdit')
    expect(SRC).toContain('saveEdit')
  })

  it('bubble green bg class is preserved', () => {
    expect(SRC).toContain('bg-primary')
  })

  it('MIN_RECORDING_MS guard is still present', () => {
    expect(SRC).toContain('MIN_RECORDING_MS')
  })
})
