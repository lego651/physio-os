import { describe, it, expect } from 'vitest'
import { formatSMSResponse, requiresUCS2 } from '../lib/sms/send'

describe('requiresUCS2', () => {
  it('returns false for plain ASCII text', () => {
    expect(requiresUCS2('Hello, how are you?')).toBe(false)
  })

  it('returns true for Chinese text', () => {
    expect(requiresUCS2('你好，今天感觉怎么样？')).toBe(true)
  })

  it('returns true for mixed text with Chinese', () => {
    expect(requiresUCS2('Pain level 你好')).toBe(true)
  })

  it('returns false for accented Latin characters', () => {
    expect(requiresUCS2('café résumé')).toBe(false)
  })

  it('returns true for emoji', () => {
    expect(requiresUCS2('Great job! 🎉')).toBe(true)
  })
})

describe('formatSMSResponse', () => {
  const appUrl = 'https://vhealth.ai'

  it('returns short messages as-is', () => {
    const text = 'Your discomfort is 2 today. Keep up the stretches!'
    expect(formatSMSResponse(text, appUrl)).toBe(text)
  })

  it('returns messages under 280 chars as-is', () => {
    const text = 'A'.repeat(280)
    expect(formatSMSResponse(text, appUrl)).toBe(text)
  })

  it('returns messages between 280-320 chars as-is', () => {
    const text = 'A'.repeat(300)
    expect(formatSMSResponse(text, appUrl)).toBe(text)
  })

  it('truncates messages over 320 chars with web link', () => {
    const text = 'A'.repeat(400)
    const result = formatSMSResponse(text, appUrl)
    expect(result).toContain('More: https://vhealth.ai/chat')
    expect(result.length).toBeLessThanOrEqual(400)
  })

  it('truncates long messages and appends web link', () => {
    const text = 'First sentence here. Second sentence here. ' + 'A'.repeat(300)
    const result = formatSMSResponse(text, appUrl)
    expect(result).toContain('More: https://vhealth.ai/chat')
    expect(result.length).toBeLessThan(text.length)
  })

  it('truncates at word or sentence boundary', () => {
    // Build a message with clear word boundaries over 320 chars
    const words = 'recovery stretching exercises routine daily morning evening practice '
    const text = words.repeat(10)
    const result = formatSMSResponse(text, appUrl)
    expect(result).toContain('More: https://vhealth.ai/chat')
    // Result should be shorter than original
    expect(result.length).toBeLessThan(text.length)
  })

  it('handles Chinese text with stricter budget', () => {
    const text = '你'.repeat(200)
    const result = formatSMSResponse(text, appUrl)
    // Chinese text uses UCS-2 encoding, stricter budget
    expect(result).toContain('More:')
  })

  it('preserves short Chinese messages', () => {
    const text = '你好，今天感觉怎么样？疼痛等级是2。'
    expect(formatSMSResponse(text, appUrl)).toBe(text)
  })

  it('handles exactly 160 char message', () => {
    const text = 'A'.repeat(160)
    expect(formatSMSResponse(text, appUrl)).toBe(text)
  })
})
