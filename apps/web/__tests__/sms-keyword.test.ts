import { describe, it, expect } from 'vitest'

// Test the keyword detection logic extracted from route.ts
// Since detectKeyword is not exported, we replicate it here for unit testing

type KeywordAction = 'stop' | 'start' | 'help' | null

function detectKeyword(body: string): KeywordAction {
  const trimmed = body.trim().toUpperCase()
  if (trimmed === 'STOP' || trimmed.includes('STOP')) return 'stop'
  if (trimmed === 'START') return 'start'
  if (trimmed === 'HELP') return 'help'
  return null
}

describe('detectKeyword', () => {
  // STOP variants
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

  it('detects "Please STOP" (contains STOP)', () => {
    expect(detectKeyword('Please STOP')).toBe('stop')
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
