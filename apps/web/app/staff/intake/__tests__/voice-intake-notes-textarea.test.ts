/**
 * Source-inspection tests for voice-intake-chat.tsx session_notes edit mode (Bug O).
 *
 * Contract: when editingStep === 'session_notes', the inline edit widget must render
 * a <Textarea> (multi-line) instead of a single-line <Input>.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const SRC = fs.readFileSync(
  path.resolve(__dirname, '../voice-intake-chat.tsx'),
  'utf-8',
)

describe('voice-intake-chat — Bug O: session_notes edit uses Textarea', () => {
  it('imports Textarea from components/ui/textarea', () => {
    // The file must import Textarea (otherwise the component cannot exist)
    expect(SRC).toMatch(/Textarea.*textarea|textarea.*Textarea/)
    expect(SRC).toContain('Textarea')
  })

  it('edit mode for session_notes renders <Textarea> not bare <Input>', () => {
    // The source must contain a Textarea in the edit branch gated on session_notes
    expect(SRC).toMatch(/session_notes[\s\S]{0,500}<Textarea|<Textarea[\s\S]{0,500}session_notes/)
  })

  it('Textarea has rows or min-h className for multi-line display', () => {
    // Must have either rows prop or a min-h className to guarantee multi-line
    expect(SRC).toMatch(/rows=\{|min-h-\[/)
  })

  it('editingStep !== session_notes and !== therapist_name still uses <Input>', () => {
    // patient_name and treatment_area must still fall through to <Input>
    expect(SRC).toContain('<Input')
  })
})
