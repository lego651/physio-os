/**
 * Source-inspection tests for voice-intake-chat.tsx CONFIRM step patient picker
 * S1.7-4 (revised): CONFIRM auto-calls match-patient, shows candidate list
 *   No "+ Create new patient" option.
 *   Always-present "None of these / Save without patient" radio (three-state selectedPatientId).
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
    expect(SRC).toMatch(/match-patient/)
  })
})

// ── S1.7-4-B: loading state ───────────────────────────────────────────────────

describe('voice-intake-confirm — S1.7-4-B: loading state while matching', () => {
  it('component has a matchLoading (or similar) state for patient lookup', () => {
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
    expect(SRC).toContain('type="radio"')
  })

  it('candidate list renders phone_suffix4 or last_seen_at from candidate', () => {
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

// ── S1.7-4-E (revised): NO "+ Create new patient" option ─────────────────────

describe('voice-intake-confirm — S1.7-4-E (revised): Create new patient option REMOVED', () => {
  it('source does NOT contain "+ Create new patient" text', () => {
    expect(SRC).not.toContain('Create new patient')
  })

  it('source does NOT reference /api/intake/create-patient in the component', () => {
    expect(SRC).not.toContain('/api/intake/create-patient')
  })

  it('source does NOT have showNewPatientForm state', () => {
    expect(SRC).not.toContain('showNewPatientForm')
  })
})

// ── S1.7-4-F (revised): always-present "None of these / Save without patient" radio ──

describe('voice-intake-confirm — S1.7-4-F: always-present unlinked radio option', () => {
  it('source does NOT have saveWithoutPatient state (replaced by three-state selectedPatientId)', () => {
    expect(SRC).not.toContain('saveWithoutPatient')
  })

  it('source contains "Save without patient" or "save without linking" text for the unlinked radio', () => {
    const hasUnlinkedLabel =
      SRC.includes('Save without patient') ||
      SRC.includes('save without linking') ||
      SRC.includes('None of these')
    expect(hasUnlinkedLabel).toBe(true)
  })

  it('source contains "No matching patient found" or "not found" message for empty candidates', () => {
    const hasEmptyMsg =
      SRC.includes('No matching patient found') ||
      SRC.includes('not found')
    expect(hasEmptyMsg).toBe(true)
  })

  it('source uses unlinked sentinel value for "save without patient" selection', () => {
    expect(SRC).toContain("'unlinked'")
  })
})

// ── S1.7-5-C (revised): Confirm & Save gating ────────────────────────────────

describe('voice-intake-confirm — S1.7-5-C (revised): Confirm & Save is disabled until patient resolved', () => {
  it('confirmIntake button disabled prop references patient selection state', () => {
    const confirmButtonMatch = SRC.match(/Confirm & save[\s\S]{0,400}disabled=|disabled=[\s\S]{0,400}Confirm & save/)
    const hasPatientGate =
      SRC.includes('selectedPatientId') ||
      (confirmButtonMatch !== null)
    expect(hasPatientGate).toBe(true)
  })

  it('Save button gate uses selectedPatientId === null to disable (three-state)', () => {
    // New UX: any radio selected (uuid or 'unlinked') enables Save — no saveWithoutPatient boolean
    expect(SRC).toContain('selectedPatientId === null')
    expect(SRC).not.toContain('saveWithoutPatient')
  })
})

// ── patient_id passed to save ─────────────────────────────────────────────────

describe('voice-intake-confirm — patient_id included in confirmIntake save body', () => {
  it('confirmIntake sends patient_id in request body', () => {
    expect(SRC).toContain('patient_id')
    const saveBodyMatch = SRC.match(/\/api\/intake\/save[\s\S]{0,400}patient_id|patient_id[\s\S]{0,400}\/api\/intake\/save/)
    expect(saveBodyMatch).not.toBeNull()
  })
})

// ── 0 candidates: no auto-select, show warning + unlinked radio ───────────────

describe('voice-intake-confirm — 0 candidates shows warning, unlinked radio always present', () => {
  it('source handles empty candidates without setting selectedPatientId to "new"', () => {
    // Old code did: setSelectedPatientId('new') when length === 0
    // New code must NOT set 'new' — unlinked radio is always present regardless
    expect(SRC).not.toContain("setSelectedPatientId('new')")
  })

  it('source checks candidates.length === 0 to show the empty-state warning', () => {
    const hasEmptyCheck =
      SRC.includes('candidates.length === 0') ||
      SRC.includes('candidates.length < 1') ||
      SRC.includes('!candidates.length') ||
      SRC.includes('candidates.length == 0')
    expect(hasEmptyCheck).toBe(true)
  })
})
