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
    // The voice-steps mic UI block (STEP_1/2/3/4 recorder section containing
    // "Tap to record") must NOT contain a Select — dropdown only appears in
    // edit mode (N4) or the error-gated fallback picker (P1).
    // Strategy: extract the Voice steps block by anchoring on its JSX comment
    // and the "Tap to record" button text, then assert no <Select inside.
    const voiceStepsBlock = SRC.match(
      /\/\* Voice steps[^*]*\*\/([\s\S]*?Tap to record[\s\S]*?)\n\s*\{\/\* Confirm/,
    )
    const blockContent = voiceStepsBlock?.[1] ?? ''
    // The mic UI block must not contain <Select
    expect(blockContent).not.toMatch(/<Select/)
    // Sanity: we did actually extract something meaningful
    expect(blockContent).toContain('Tap to record')
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
    // The STEP_3 active-step render block (without error guard) must be Select-free.
    // The error+STEP_3 fallback picker is intentionally allowed to have a Select
    // (it is guarded by `error && step === 'STEP_3_THERAPIST'`).
    // Verify: the b.stepKey === therapist_name block contains a Select
    const editSelectMatches = [...SRC.matchAll(/b\.stepKey === 'therapist_name'[\s\S]{0,300}<Select/g)]
    // Match STEP_3_THERAPIST && <Select only when NOT preceded by `error &&`
    // (i.e., the plain unguarded STEP_3 render block must stay Select-free)
    const unguardedStep3SelectMatches = [...SRC.matchAll(
      /(?<![^\n]*error[^\n]*)\bstep === 'STEP_3_THERAPIST' &&[\s\S]{0,600}<Select/g
    )]
    // Edit mode has its Select
    expect(editSelectMatches.length).toBeGreaterThanOrEqual(1)
    // Unguarded STEP_3 active block has no Select
    expect(unguardedStep3SelectMatches.length).toBe(0)
  })
})

// ── P1: error + STEP_3 → fallback selector renders ───────────────────────────

describe('voice-intake-chat — P1: fallback picker renders when error + STEP_3', () => {
  it('source contains handleTherapistFallbackPick function', () => {
    expect(SRC).toContain('handleTherapistFallbackPick')
  })

  it('fallback picker JSX is gated on both error and STEP_3_THERAPIST', () => {
    // The conditional that gates the fallback Select must check BOTH error and step.
    // Accept either order: error && step === ... OR step === ... && error
    expect(SRC).toMatch(
      /error\s*&&\s*step\s*===\s*['"]STEP_3_THERAPIST['"]|step\s*===\s*['"]STEP_3_THERAPIST['"]\s*&&\s*error/
    )
  })

  it('fallback picker includes a Select component inside its conditional block', () => {
    // The error+STEP_3 block must contain a <Select
    const block = SRC.match(
      /error\s*&&\s*step\s*===\s*['"]STEP_3_THERAPIST['"][\s\S]{0,800}<Select/
    )
    expect(block).not.toBeNull()
  })
})

// ── P2: non-error / non-STEP_3 → selector does NOT render ────────────────────

describe('voice-intake-chat — P2: fallback picker absent when no error or wrong step', () => {
  it('fallback picker conditional requires both error and STEP_3 (not step alone)', () => {
    // The condition must include `error` — bare `step === STEP_3_THERAPIST` alone
    // must not have an unguarded <Select in its block (N3 still holds).
    // This test is a logical complement of P1 and the revised N3.
    // If the source has `error && step === 'STEP_3_THERAPIST'`, the condition
    // is compound — removing error would suppress the picker. ✓
    expect(SRC).toMatch(
      /error\s*&&\s*step\s*===\s*['"]STEP_3_THERAPIST['"]/
    )
    // And the plain STEP_3 render section (the mic UI block) must NOT have a Select
    // (already enforced by N3 — restated here for clarity of P2's intent).
    const micBlock = SRC.match(
      /STEP_1_NAME.*STEP_2_TREATMENT.*STEP_3_THERAPIST.*STEP_4_NOTES[\s\S]{0,600}Tap to record/
    )
    expect(micBlock).not.toBeNull()
  })
})

// ── P3: handleTherapistFallbackPick does the three required things ────────────

describe('voice-intake-chat — P3: handleTherapistFallbackPick implementation', () => {
  it('function calls setError(null) to clear the error', () => {
    // Extract the function body
    const fnBody = SRC.match(
      /function handleTherapistFallbackPick[\s\S]{0,600}?(?=\n\s*function|\n\s*async function|\n\s*\/\/\s*──)/
    )
    expect(fnBody).not.toBeNull()
    expect(fnBody![0]).toContain('setError(null)')
  })

  it('function calls setResult to update therapist_name', () => {
    const fnBody = SRC.match(
      /function handleTherapistFallbackPick[\s\S]{0,600}?(?=\n\s*function|\n\s*async function|\n\s*\/\/\s*──)/
    )
    expect(fnBody).not.toBeNull()
    expect(fnBody![0]).toContain('therapist_name')
    expect(fnBody![0]).toContain('setResult')
  })

  it('function calls advanceStep with STEP_4_NOTES', () => {
    const fnBody = SRC.match(
      /function handleTherapistFallbackPick[\s\S]{0,600}?(?=\n\s*function|\n\s*async function|\n\s*\/\/\s*──)/
    )
    expect(fnBody).not.toBeNull()
    expect(fnBody![0]).toContain("advanceStep('STEP_4_NOTES')")
  })
})

// ── P4: SelectItem value is therapist id, not name ───────────────────────────

describe('voice-intake-chat — P4: fallback picker SelectItem uses therapist id as value', () => {
  it('SelectItem inside fallback picker has value={t.id}', () => {
    // The fallback picker maps therapists to SelectItem elements.
    // Each item's value must be t.id (not t.name) so handleTherapistFallbackPick
    // receives an id and can look up the canonical name.
    const block = SRC.match(
      /error\s*&&\s*step\s*===\s*['"]STEP_3_THERAPIST['"][\s\S]{0,1000}SelectItem/
    )
    expect(block).not.toBeNull()
    // value should be t.id
    expect(block![0]).toContain('value={t.id}')
    // value should NOT be t.name
    expect(block![0]).not.toContain('value={t.name}')
  })
})
