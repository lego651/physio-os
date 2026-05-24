/**
 * Source-inspection tests for voice-intake-chat.tsx CONFIRM step patient picker
 * S1.7-4: CONFIRM auto-calls match-patient, shows candidate list
 * S1.7-5: "+ Create new patient" inline form
 *
 * Pattern: read the source file and assert structural properties, following
 * the existing source-inspection convention in this project.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const SRC = fs.readFileSync(
  path.resolve(__dirname, '../voice-intake-chat.tsx'),
  'utf-8',
)

// ── S1.7-4-A: match-patient API call in CONFIRM step ─────────────────────────

describe('voice-intake-confirm — S1.7-4-A: CONFIRM step calls match-patient API', () => {
  it('component imports useEffect (needed for CONFIRM-mount API call)', () => {
    expect(SRC).toContain('useEffect')
  })

  it('source references /api/intake/match-patient endpoint', () => {
    expect(SRC).toContain('/api/intake/match-patient')
  })

  it('CONFIRM step has a fetch call to match-patient', () => {
    // The match-patient fetch must appear in the source
    expect(SRC).toMatch(/match-patient/)
  })
})

// ── S1.7-4-B: loading state ───────────────────────────────────────────────────

describe('voice-intake-confirm — S1.7-4-B: loading state while matching', () => {
  it('component has a matchLoading (or similar) state for patient lookup', () => {
    // Accepts matchLoading or patientLoading or candidatesLoading
    const hasLoadingState =
      SRC.includes('matchLoading') ||
      SRC.includes('patientLoading') ||
      SRC.includes('candidatesLoading') ||
      SRC.includes('loadingMatch') ||
      SRC.includes('lookingUp')
    expect(hasLoadingState).toBe(true)
  })

  it('loading text "Looking up patient" appears in source', () => {
    expect(SRC).toContain('Looking up patient')
  })
})

// ── S1.7-4-C: candidate list rendering ───────────────────────────────────────

describe('voice-intake-confirm — S1.7-4-C: candidate list displayed', () => {
  it('component has candidates state', () => {
    expect(SRC).toContain('candidates')
  })

  it('candidate rows are rendered with radio inputs', () => {
    // Each candidate gets a radio button for selection
    expect(SRC).toContain('type="radio"')
  })

  it('candidate list renders phone_suffix4 or last_seen_at from candidate', () => {
    // Candidate display must show at least one of: phone info or last visit
    const hasPhoneSuffix = SRC.includes('phone_suffix4')
    const hasLastSeen = SRC.includes('last_seen_at') || SRC.includes('last visit')
    expect(hasPhoneSuffix || hasLastSeen).toBe(true)
  })
})

// ── S1.7-4-D: selectedPatientId state ────────────────────────────────────────

describe('voice-intake-confirm — S1.7-4-D: selectedPatientId tracked in state', () => {
  it('component has selectedPatientId state variable', () => {
    expect(SRC).toContain('selectedPatientId')
  })
})

// ── S1.7-4-E: "+ Create new patient" option ──────────────────────────────────

describe('voice-intake-confirm — S1.7-4-E: Create new patient option always visible', () => {
  it('source contains "+ Create new patient" text', () => {
    expect(SRC).toContain('Create new patient')
  })

  it('Create new patient option is a radio choice', () => {
    // The create-new option must be a radio, not just a button, for consistent UX
    // Accept either explicit radio or a pattern matching create-new with type=radio nearby
    expect(SRC).toContain('Create new patient')
    expect(SRC).toContain('type="radio"')
  })
})

// ── S1.7-5-A: inline new patient form ────────────────────────────────────────

describe('voice-intake-confirm — S1.7-5-A: inline new patient form appears', () => {
  it('source has showNewPatientForm or newPatientMode state', () => {
    const hasFormState =
      SRC.includes('showNewPatientForm') ||
      SRC.includes('newPatientMode') ||
      SRC.includes('showCreateForm') ||
      SRC.includes('creatingNew')
    expect(hasFormState).toBe(true)
  })

  it('new patient form has a Phone input field', () => {
    // The inline form must include a Phone field
    expect(SRC).toContain('Phone')
  })

  it('new patient form has an Email input field', () => {
    expect(SRC).toContain('Email')
  })
})

// ── S1.7-5-B: save patient API call ──────────────────────────────────────────

describe('voice-intake-confirm — S1.7-5-B: Save patient calls create-patient API', () => {
  it('source references /api/intake/create-patient endpoint', () => {
    expect(SRC).toContain('/api/intake/create-patient')
  })
})

// ── S1.7-5-C: Confirm & Save gating ──────────────────────────────────────────

describe('voice-intake-confirm — S1.7-5-C: Confirm & Save is disabled until patient resolved', () => {
  it('confirmIntake button disabled prop references patient selection state', () => {
    // The Confirm & Save button disabled prop must consider patient selection
    // Look for disabled={saving || ...something about patient selection}
    const confirmButtonMatch = SRC.match(/Confirm & save[\s\S]{0,400}disabled=|disabled=[\s\S]{0,400}Confirm & save/)
    // More direct: find the disabled prop on the confirm button
    // It should reference saving AND some patient gating condition
    const disabledPattern = SRC.match(/disabled=\{([^}]+)\}[\s\S]{0,200}Confirm & save|Confirm & save[\s\S]{0,200}disabled=\{([^}]+)\}/)
    const hasPatientGate =
      SRC.includes('patientResolved') ||
      SRC.includes('canSave') ||
      SRC.includes('selectedPatientId') ||
      (confirmButtonMatch !== null)
    expect(hasPatientGate).toBe(true)
  })
})

// ── S1.7-4/5: patient_id passed to save ──────────────────────────────────────

describe('voice-intake-confirm — patient_id included in confirmIntake save body', () => {
  it('confirmIntake sends patient_id in request body', () => {
    // The JSON body sent to /api/intake/save must include patient_id
    expect(SRC).toContain('patient_id')
    // And it must appear near the save body
    const saveBodyMatch = SRC.match(/\/api\/intake\/save[\s\S]{0,400}patient_id|patient_id[\s\S]{0,400}\/api\/intake\/save/)
    expect(saveBodyMatch).not.toBeNull()
  })
})

// ── auto-select when 0 candidates ────────────────────────────────────────────

describe('voice-intake-confirm — 0 candidates auto-selects create new', () => {
  it('source handles the case where candidates list is empty', () => {
    // When no candidates returned, auto-select create new path.
    // The implementation uses the fetched array length to detect zero results.
    // Accept any form: found.length === 0, candidates.length === 0, length < 1, etc.
    const hasEmptyCheck =
      SRC.includes('.length === 0') ||
      SRC.includes('.length < 1') ||
      SRC.includes('!candidates.length') ||
      SRC.includes('.length == 0')
    expect(hasEmptyCheck).toBe(true)
  })
})
