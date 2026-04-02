import { describe, it, expect } from 'vitest'
import {
  isValidPainLevel,
  isValidDiscomfort,
  isValidSittingTolerance,
  normalizePhone,
  PAIN_SCALE,
  DISCOMFORT_SCALE,
} from '../metrics'

describe('Pain level validation', () => {
  it('accepts values 1-10', () => {
    for (let i = PAIN_SCALE.min; i <= PAIN_SCALE.max; i++) {
      expect(isValidPainLevel(i)).toBe(true)
    }
  })

  it('rejects 0', () => {
    expect(isValidPainLevel(0)).toBe(false)
  })

  it('rejects 11', () => {
    expect(isValidPainLevel(11)).toBe(false)
  })

  it('rejects non-integers', () => {
    expect(isValidPainLevel(3.5)).toBe(false)
  })

  it('rejects negative values', () => {
    expect(isValidPainLevel(-1)).toBe(false)
  })
})

describe('Discomfort validation', () => {
  it('accepts values 0-3', () => {
    for (let i = DISCOMFORT_SCALE.min; i <= DISCOMFORT_SCALE.max; i++) {
      expect(isValidDiscomfort(i)).toBe(true)
    }
  })

  it('rejects 4', () => {
    expect(isValidDiscomfort(4)).toBe(false)
  })

  it('rejects negative values', () => {
    expect(isValidDiscomfort(-1)).toBe(false)
  })
})

describe('Sitting tolerance validation', () => {
  it('accepts 0', () => {
    expect(isValidSittingTolerance(0)).toBe(true)
  })

  it('accepts positive integers', () => {
    expect(isValidSittingTolerance(45)).toBe(true)
  })

  it('rejects negative values', () => {
    expect(isValidSittingTolerance(-1)).toBe(false)
  })
})

describe('Phone normalization', () => {
  it('normalizes 10-digit to E.164', () => {
    expect(normalizePhone('6041234567')).toBe('+16041234567')
  })

  it('normalizes 11-digit with leading 1', () => {
    expect(normalizePhone('16041234567')).toBe('+16041234567')
  })

  it('handles +1 prefix', () => {
    expect(normalizePhone('+16041234567')).toBe('+16041234567')
  })

  it('strips non-digit characters', () => {
    expect(normalizePhone('(604) 123-4567')).toBe('+16041234567')
  })

  it('handles dashes and spaces', () => {
    expect(normalizePhone('604-123-4567')).toBe('+16041234567')
  })
})
