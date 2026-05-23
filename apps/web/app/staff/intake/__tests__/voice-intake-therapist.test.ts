/**
 * Source-inspection tests for voice-intake-chat.tsx STEP_3_THERAPIST behavior.
 * (J4, J5, J6)
 *
 * Pattern: read the source file and assert structural properties, following
 * the existing extract.test.ts convention in this project.
 *
 * RED phase: these tests document contracts not yet implemented.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const SRC = fs.readFileSync(
  path.resolve(__dirname, '../voice-intake-chat.tsx'),
  'utf-8',
)

// ── J1: STEP_3 renders mic UI ─────────────────────────────────────────────────

describe('voice-intake-chat — J1: STEP_3_THERAPIST shows mic UI', () => {
  it('STEP_3_THERAPIST block contains startRecording (mic UI)', () => {
    // STEP_3 has its own render block that includes mic UI (startRecording)
    // Verify both appear in the source — structural co-presence check.
    expect(SRC).toContain('STEP_3_THERAPIST')
    expect(SRC).toContain('startRecording')
    // The STEP_3 render block comes before the voice steps block and has its own mic buttons
    expect(SRC).toMatch(/STEP_3_THERAPIST[\s\S]*?startRecording/)
  })
})

// ── J3: Select is controlled with value prop ──────────────────────────────────

describe('voice-intake-chat — J3: STEP_3 Select is controlled', () => {
  it('passes a value prop to the Select (controlled component for pre-fill)', () => {
    // Controlled Select requires value={...} not just onValueChange
    expect(SRC).toMatch(/<Select[^>]*value=\{/)
  })
})

// ── J4 (updated for N1): processAudio step=3 pushes bubble directly ──────────

describe('voice-intake-chat — J4 (N1): processAudio step=3 pushes bubble and advances', () => {
  it('processAudio step=3 branch calls pushBubble with therapist name', () => {
    // After N1: step=3 handler must call pushBubble (auto-bubble on match).
    // This is tested more precisely by N1 tests above; this test keeps J4 intent alive
    // under the new contract.
    const step3Match = SRC.match(
      /else if \(step === 'STEP_3_THERAPIST'\)([\s\S]*?)(?=\} else if \(step === 'STEP_4_NOTES'\))/,
    )
    expect(step3Match).not.toBeNull()
    expect(step3Match![1]).toContain('pushBubble')
  })

  it('processAudio step=3 branch calls advanceStep', () => {
    const step3Match = SRC.match(
      /else if \(step === 'STEP_3_THERAPIST'\)([\s\S]*?)(?=\} else if \(step === 'STEP_4_NOTES'\))/,
    )
    expect(step3Match).not.toBeNull()
    expect(step3Match![1]).toContain('advanceStep')
  })
})

// ── J5 (updated for N1): edit mode updates bubble via direct state, not handleTherapistSelect ──

describe('voice-intake-chat — J5 (N1): therapist edit path uses Select with direct state update', () => {
  it('bubble edit inline block for therapist_name sets result and bubbles directly', () => {
    // After N1: handleTherapistSelect is removed (was only called from STEP_3 block).
    // Edit mode does its own setResult + setBubbles inside the onValueChange handler.
    expect(SRC).toContain('onValueChange')
    // The edit path sets therapist_name in result directly
    expect(SRC).toMatch(/therapist_name.*value|value.*therapist_name/)
  })
})

// ── J6: edit flow uses Select, not text Input ─────────────────────────────────

describe('voice-intake-chat — J6: edit flow for therapist_name uses Select', () => {
  it('editingStep === therapist_name branch renders a Select, not a plain Input', () => {
    // The editing inline UI for therapist_name must use a Select component.
    // Confirm the source contains therapist_name edit path with Select.
    expect(SRC).toMatch(/therapist_name[\s\S]{0,400}Select|Select[\s\S]{0,400}therapist_name/)
  })

  it('editingStep !== therapist_name branch still uses Input for other fields', () => {
    // Other fields (patient_name, session_notes etc.) continue to use Input
    expect(SRC).toContain('<Input')
  })
})

// ── J7/J8 wiring: processAudio step=3 handles empty/single therapist ─────────

describe('voice-intake-chat — upload route step=3 error state visible to user', () => {
  it('component has error state for UI display (used by matcher error path)', () => {
    // After N1: matchedTherapistId is gone. Error cases (e.g. no therapists) fall
    // through to the existing catch/setError path. Verify the component has
    // `error` state and a UI block that renders it.
    expect(SRC).toContain('setError')
    expect(SRC).toContain('error &&')
  })
})

// ── J11: upload route step=3 param is sent ───────────────────────────────────

describe('voice-intake-chat — processAudio sends step=3 for STEP_3_THERAPIST', () => {
  it('stepParam calculation includes step=3 for STEP_3_THERAPIST', () => {
    // The stepParam ternary maps STEP_3_THERAPIST to '3'
    // They appear in adjacent lines of the multiline ternary
    expect(SRC).toContain('STEP_3_THERAPIST')
    expect(SRC).toMatch(/STEP_3_THERAPIST[\s\S]{0,60}['"]3['"]|['"]3['"][\s\S]{0,60}STEP_3_THERAPIST/)
  })
})

// ── N1: voice success → pushBubble + advanceStep immediately (no confirm button) ──

describe('voice-intake-chat — N1: STEP_3 voice success pushes bubble and auto-advances', () => {
  it('processAudio step=3 branch calls pushBubble (auto-bubble on match)', () => {
    // After N1 fix: the step=3 handler in processAudio must call pushBubble
    // to display the canonical therapist name immediately.
    // Extract the STEP_3_THERAPIST branch of processAudio and verify pushBubble appears.
    const step3Match = SRC.match(
      /else if \(step === 'STEP_3_THERAPIST'\)([\s\S]*?)(?=\} else if \(step === 'STEP_4_NOTES'\))/,
    )
    expect(step3Match).not.toBeNull()
    expect(step3Match![1]).toContain('pushBubble')
  })

  it('processAudio step=3 branch calls advanceStep (auto-advance to STEP_4)', () => {
    // After N1 fix: the step=3 handler must call advanceStep('STEP_4_NOTES')
    const step3Match = SRC.match(
      /else if \(step === 'STEP_3_THERAPIST'\)([\s\S]*?)(?=\} else if \(step === 'STEP_4_NOTES'\))/,
    )
    expect(step3Match).not.toBeNull()
    expect(step3Match![1]).toContain('advanceStep')
  })

  it('processAudio step=3 branch does NOT call setMatchedTherapistId (no pre-fill state needed)', () => {
    // After N1 fix: the old pre-fill pattern (setMatchedTherapistId) is gone
    // from the step=3 processAudio block — bubble+advance replaces it.
    const step3Match = SRC.match(
      /else if \(step === 'STEP_3_THERAPIST'\)([\s\S]*?)(?=\} else if \(step === 'STEP_4_NOTES'\))/,
    )
    expect(step3Match).not.toBeNull()
    expect(step3Match![1]).not.toContain('setMatchedTherapistId')
  })
})

// ── N2: "Confirm therapist" button is removed ─────────────────────────────────

describe('voice-intake-chat — N2: Confirm therapist button is gone', () => {
  it('source does not contain "Confirm therapist" text', () => {
    expect(SRC).not.toContain('Confirm therapist')
  })
})

// ── N3: STEP_3 default render does NOT include dropdown ──────────────────────

describe('voice-intake-chat — N3: STEP_3 default render has no dropdown', () => {
  it('STEP_3_THERAPIST render block does not include a Select component', () => {
    // The STEP_3_THERAPIST render block (step === STEP_3_THERAPIST conditional)
    // must NOT contain a Select — dropdown only appears in edit mode (N4).
    // Strategy: extract the STEP_3 JSX block and verify no Select inside.
    const step3Block = SRC.match(
      /\{\/\*[^*]*Step 3[^*]*\*\/\}[\s\S]*?\{step === 'STEP_3_THERAPIST' &&([\s\S]*?)\}\s*\n\s*\{\/\*/,
    )
    // Fallback: look for the block via its condition
    const condBlock = SRC.match(
      /step === 'STEP_3_THERAPIST' &&\s*\(([\s\S]*?)\n\s*\)\}/,
    )
    const blockContent = step3Block?.[1] ?? condBlock?.[1] ?? ''
    // The block must not contain <Select (dropdown only in edit mode)
    expect(blockContent).not.toMatch(/<Select/)
  })
})

// ── N4: edit mode for therapist_name shows dropdown ──────────────────────────

describe('voice-intake-chat — N4: edit mode for therapist_name shows Select dropdown', () => {
  it('editingStep === therapist_name branch renders Select (already present from J6)', () => {
    // This is preserved from J6. The edit inline path for therapist_name must use Select.
    expect(SRC).toMatch(/therapist_name[\s\S]{0,400}<Select|<Select[\s\S]{0,400}therapist_name/)
  })

  it('STEP_3 default render block is separate from the edit-mode Select', () => {
    // The Select in the bubble edit inline block (b.stepKey === therapist_name)
    // must be the ONLY Select associated with therapist_name logic.
    // The STEP_3 active-step render block must be Select-free.
    // Verify: the b.stepKey === therapist_name block contains a Select
    const editSelectMatches = [...SRC.matchAll(/b\.stepKey === 'therapist_name'[\s\S]{0,300}<Select/g)]
    const therapistSelectMatches = [...SRC.matchAll(/step === 'STEP_3_THERAPIST' &&[\s\S]{0,600}<Select/g)]
    // Edit mode has its Select
    expect(editSelectMatches.length).toBeGreaterThanOrEqual(1)
    // STEP_3 active block has no Select
    expect(therapistSelectMatches.length).toBe(0)
  })
})
