import { describe, it, expect } from 'vitest'
import { isHallucination, isTooShort } from '../whisper-hallucinations'

// ─── K2: Hallucination blacklist ──────────────────────────────────────────────

describe('isHallucination — K2 blacklist', () => {
  // --- Positive cases: must be caught ---

  it('catches "Thank you for watching!" (exact YouTube outro)', () => {
    expect(isHallucination('Thank you for watching!')).toBe(true)
  })

  it('catches "Thanks for watching" (variant)', () => {
    expect(isHallucination('Thanks for watching')).toBe(true)
  })

  it('catches case-insensitive variant "THANK YOU FOR WATCHING"', () => {
    expect(isHallucination('THANK YOU FOR WATCHING')).toBe(true)
  })

  it('catches "Don\'t forget to subscribe"', () => {
    expect(isHallucination("Don't forget to subscribe")).toBe(true)
  })

  it('catches "Please subscribe to my channel"', () => {
    expect(isHallucination('Please subscribe to my channel')).toBe(true)
  })

  it('catches "Like and subscribe"', () => {
    expect(isHallucination('Like and subscribe')).toBe(true)
  })

  it('catches "See you next time"', () => {
    expect(isHallucination('See you next time')).toBe(true)
  })

  it('catches "See you in the next video"', () => {
    expect(isHallucination('See you in the next video')).toBe(true)
  })

  it('catches lone music symbol ♪', () => {
    expect(isHallucination('♪')).toBe(true)
  })

  it('catches "[Music]" bracket notation', () => {
    expect(isHallucination('[Music]')).toBe(true)
  })

  it('catches "[music]" lowercase bracket notation', () => {
    expect(isHallucination('[music]')).toBe(true)
  })

  it('catches "[Applause]"', () => {
    expect(isHallucination('[Applause]')).toBe(true)
  })

  it('catches "[Laughter]"', () => {
    expect(isHallucination('[Laughter]')).toBe(true)
  })

  it('catches "Thank you for watching." with trailing period', () => {
    expect(isHallucination('Thank you for watching.')).toBe(true)
  })

  it('catches "  Thank you for watching!  " with surrounding whitespace', () => {
    expect(isHallucination('  Thank you for watching!  ')).toBe(true)
  })

  // --- False positive protection: K2 must NOT block these ---

  it('does NOT block real patient name "Cathy Liu" (2s real recording result)', () => {
    expect(isHallucination('Cathy Liu')).toBe(false)
  })

  it('does NOT block real therapist name "Cathy Wang"', () => {
    expect(isHallucination('Cathy Wang')).toBe(false)
  })

  it('does NOT block real treatment note "Deep tissue massage for lower back"', () => {
    expect(isHallucination('Deep tissue massage for lower back')).toBe(false)
  })

  // --- Failure mode #5: long sentence with hallucination phrase embedded ---
  // Real operator speech: over 60 chars → length gate prevents false positive.
  it('does NOT block long sentence containing "thank you for watching" (>60 chars, length gate)', () => {
    const longSentence =
      'The patient thanked me for watching her exercise form during the rehabilitation session today.'
    expect(isHallucination(longSentence)).toBe(false)
  })

  it('does NOT block STEP_4 notes with "subscribe" embedded in real content (>60 chars)', () => {
    const notes =
      'Patient asked if they should subscribe to the home exercise program between sessions.'
    expect(isHallucination(notes)).toBe(false)
  })
})

// ─── K3: Too-short transcript guard ──────────────────────────────────────────

describe('isTooShort — K3 length guard', () => {
  it('flags a single period "."', () => {
    expect(isTooShort('.')).toBe(true)
  })

  it('flags a single space " "', () => {
    expect(isTooShort(' ')).toBe(true)
  })

  it('flags empty string ""', () => {
    expect(isTooShort('')).toBe(true)
  })

  it('flags a single letter "a"', () => {
    expect(isTooShort('a')).toBe(true)
  })

  it('does NOT flag "OK" (2 chars, just at threshold)', () => {
    expect(isTooShort('OK')).toBe(false)
  })

  it('does NOT flag "Cathy Liu" (9 chars)', () => {
    expect(isTooShort('Cathy Liu')).toBe(false)
  })

  it('does NOT flag "Uh" (2 chars)', () => {
    expect(isTooShort('Uh')).toBe(false)
  })
})
