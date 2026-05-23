import { describe, it, expect } from 'vitest'
import { formatTreatmentBubble } from '../treatment-bubble'

// I6: service only — treatment_area is 'unspecified'
// Bubble must show session_type, must NOT show 'unspecified' alone.
describe('formatTreatmentBubble — I6: session_type recognised, area unspecified', () => {
  it('shows session_type when area is unspecified', () => {
    const text = formatTreatmentBubble('unspecified', 'acupuncture', 'acupuncture')
    expect(text).toContain('acupuncture')
  })

  it('does NOT show "unspecified" as standalone bubble text', () => {
    const text = formatTreatmentBubble('unspecified', 'acupuncture', 'acupuncture')
    expect(text).not.toBe('unspecified')
  })
})

// I7: service + area both known
// Bubble must show both pieces of information.
describe('formatTreatmentBubble — I7: session_type and area both recognised', () => {
  it('shows service type', () => {
    const text = formatTreatmentBubble('right shoulder', 'massage', 'deep tissue massage right shoulder')
    expect(text).toContain('massage')
  })

  it('shows body area', () => {
    const text = formatTreatmentBubble('right shoulder', 'massage', 'deep tissue massage right shoulder')
    expect(text).toContain('right shoulder')
  })
})

// I8: session_type is 'other' — raw transcript must surface
// Bubble must show the raw transcript so operator knows what was heard.
describe('formatTreatmentBubble — I8: session_type "other", surface raw transcript', () => {
  it('shows raw transcript when session_type is other', () => {
    const text = formatTreatmentBubble('unspecified', 'other', 'some unknown therapy')
    expect(text).toContain('some unknown therapy')
  })

  it('does NOT show only "unspecified" when session_type is other', () => {
    const text = formatTreatmentBubble('unspecified', 'other', 'some unknown therapy')
    expect(text).not.toBe('unspecified')
  })
})
