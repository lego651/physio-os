import { describe, it, expect } from 'vitest'
import { detectKeyword } from '@/lib/sms/keywords'

describe('detectKeyword', () => {
  // STOP variants (exact match only)
  it('detects "STOP"', () => {
    expect(detectKeyword('STOP')).toBe('stop')
  })

  it('detects "stop" (lowercase)', () => {
    expect(detectKeyword('stop')).toBe('stop')
  })

  it('detects "Stop" (mixed case)', () => {
    expect(detectKeyword('Stop')).toBe('stop')
  })

  it('detects "STOP" with whitespace', () => {
    expect(detectKeyword('  STOP  ')).toBe('stop')
  })

  // Twilio-recommended opt-out variants
  it('detects "STOPALL"', () => {
    expect(detectKeyword('STOPALL')).toBe('stop')
  })

  it('detects "UNSUBSCRIBE"', () => {
    expect(detectKeyword('unsubscribe')).toBe('stop')
  })

  it('detects "CANCEL"', () => {
    expect(detectKeyword('Cancel')).toBe('stop')
  })

  it('detects "END"', () => {
    expect(detectKeyword('END')).toBe('stop')
  })

  it('detects "QUIT"', () => {
    expect(detectKeyword('quit')).toBe('stop')
  })

  // False-positive regression tests (S3R-01)
  it('returns null for "the pain stopped"', () => {
    expect(detectKeyword('the pain stopped')).toBe(null)
  })

  it('returns null for "nonstop"', () => {
    expect(detectKeyword('nonstop')).toBe(null)
  })

  it('returns null for "unstoppable"', () => {
    expect(detectKeyword('unstoppable')).toBe(null)
  })

  it('returns null for "I can\'t stop sneezing"', () => {
    expect(detectKeyword("I can't stop sneezing")).toBe(null)
  })

  it('returns null for "I stopped taking the medication"', () => {
    expect(detectKeyword('I stopped taking the medication')).toBe(null)
  })

  it('returns null for "Please STOP" (not exact match)', () => {
    expect(detectKeyword('Please STOP')).toBe(null)
  })

  // START variants
  it('detects "START"', () => {
    expect(detectKeyword('START')).toBe('start')
  })

  it('detects "start" (lowercase)', () => {
    expect(detectKeyword('start')).toBe('start')
  })

  it('detects "Start" (mixed case)', () => {
    expect(detectKeyword('Start')).toBe('start')
  })

  // HELP variants
  it('detects "HELP"', () => {
    expect(detectKeyword('HELP')).toBe('help')
  })

  it('detects "help" (lowercase)', () => {
    expect(detectKeyword('help')).toBe('help')
  })

  // Non-keyword messages
  it('returns null for normal message', () => {
    expect(detectKeyword('My pain is 3 today')).toBe(null)
  })

  it('returns null for empty string', () => {
    expect(detectKeyword('')).toBe(null)
  })

  it('returns null for YES', () => {
    expect(detectKeyword('YES')).toBe(null)
  })
})
