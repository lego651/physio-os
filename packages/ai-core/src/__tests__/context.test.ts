import { describe, it, expect } from 'vitest'
import { estimateTokens, budgetMessages } from '../context'

describe('estimateTokens', () => {
  it('estimates English tokens as chars/4', () => {
    expect(estimateTokens('hello')).toBe(2) // 5/4 = 1.25, ceil = 2
  })

  it('estimates empty string as 0', () => {
    expect(estimateTokens('')).toBe(0)
  })

  it('estimates long English text correctly', () => {
    const text = 'a'.repeat(1000)
    expect(estimateTokens(text)).toBe(250)
  })

  // CJK token estimation (R010)
  it('estimates Chinese text with higher token ratio', () => {
    // 2000 Chinese characters at ~1.5 chars/token ≈ 1333 tokens
    const chineseText = '你'.repeat(2000)
    const tokens = estimateTokens(chineseText)
    expect(tokens).toBeGreaterThan(1000)
    expect(tokens).toBeLessThan(2000)
  })

  it('estimates mixed CJK/Latin text', () => {
    // Half Chinese, half Latin
    const text = '你好'.repeat(500) + 'hello '.repeat(166)
    const tokens = estimateTokens(text)
    // Should be between pure-Latin and pure-CJK estimates
    const pureLatin = Math.ceil(text.length / 4)
    const pureCJK = Math.ceil(text.length / 1.5)
    expect(tokens).toBeGreaterThan(pureLatin)
    expect(tokens).toBeLessThan(pureCJK)
  })
})

describe('budgetMessages', () => {
  function makeMessage(id: string, content: string) {
    return {
      id,
      patient_id: 'p1',
      role: 'user' as const,
      content,
      channel: 'web' as const,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as never // Type assertion since we only need content and ordering
  }

  it('returns empty array for empty input', () => {
    const result = budgetMessages([])
    expect(result).toEqual([])
  })

  it('returns all messages when under budget', () => {
    const messages = [
      makeMessage('1', 'Hello'),
      makeMessage('2', 'How are you?'),
      makeMessage('3', 'Good thanks'),
    ]
    const result = budgetMessages(messages)
    expect(result).toHaveLength(3)
  })

  it('returns messages in chronological order (reversed from input)', () => {
    const messages = [
      makeMessage('3', 'newest'),
      makeMessage('2', 'middle'),
      makeMessage('1', 'oldest'),
    ]
    const result = budgetMessages(messages)
    expect(result[0]).toEqual(messages[2]) // oldest first
    expect(result[result.length - 1]).toEqual(messages[0]) // newest last
  })

  it('truncates when messages exceed budget', () => {
    // Create messages that exceed the budget (4000 tokens * 4 chars = 16000 chars for Latin)
    const messages = Array.from({ length: 20 }, (_, i) =>
      makeMessage(String(i), 'x'.repeat(1000)),
    )
    const result = budgetMessages(messages)
    expect(result.length).toBeLessThan(20)
    expect(result.length).toBeGreaterThan(0)
  })

  it('handles messages with null-like content gracefully', () => {
    const messages = [makeMessage('1', '')]
    const result = budgetMessages(messages)
    expect(result).toHaveLength(1)
  })
})
