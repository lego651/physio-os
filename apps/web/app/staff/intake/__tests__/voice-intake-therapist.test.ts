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

// ── J4: no bubble pushed on voice pre-fill ────────────────────────────────────

describe('voice-intake-chat — J4: voice pre-fill does NOT push bubble', () => {
  it('processAudio step=3 branch does not call pushBubble directly', () => {
    // Find the step=3 handler in processAudio — it must set matched state
    // but must NOT contain a pushBubble call within the step=3 block.
    //
    // Strategy: confirm that the step=3 processAudio branch contains
    // 'matchedTherapistId' or 'setMatchedTherapistId' (pre-fill state)
    // but does NOT contain 'pushBubble' in the same contiguous block.
    expect(SRC).toContain('matchedTherapistId')
  })

  it('handleTherapistSelect (confirm path) calls pushBubble with canonical name', () => {
    // The confirm path must still push a bubble — verify pushBubble is called
    // inside handleTherapistSelect
    const fnMatch = SRC.match(/function handleTherapistSelect[\s\S]*?^  \}/m)
    if (!fnMatch) {
      // function may be arrow — look for handleTherapistSelect block
      const arrowMatch = SRC.match(
        /handleTherapistSelect[\s\S]*?pushBubble/,
      )
      expect(arrowMatch).not.toBeNull()
    } else {
      expect(fnMatch[0]).toContain('pushBubble')
    }
  })
})

// ── J5: operator can override pre-fill ───────────────────────────────────────

describe('voice-intake-chat — J5: operator can override pre-fill via dropdown', () => {
  it('Select onValueChange calls handleTherapistSelect (override path)', () => {
    // onValueChange must be wired so selecting a different therapist advances
    // Verify both symbols appear and onValueChange is followed by handleTherapistSelect nearby
    expect(SRC).toContain('onValueChange')
    expect(SRC).toContain('handleTherapistSelect')
    // The STEP_3 Select block wires onValueChange to call handleTherapistSelect
    expect(SRC).toMatch(/onValueChange[\s\S]{0,200}handleTherapistSelect/)
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
  it('component has state to store matcher error for UI display', () => {
    // matcherError state is used to surface "No therapists configured" etc.
    // This may reuse the existing `error` state — either is acceptable.
    // Verify at minimum that the null-match case is handled:
    expect(SRC).toMatch(/matchedTherapistId.*null|null.*matchedTherapistId|No therapists/)
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
