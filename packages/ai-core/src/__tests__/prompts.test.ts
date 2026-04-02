import { describe, it, expect } from 'vitest'
import { buildSystemPrompt } from '../prompts/system'

describe('buildSystemPrompt', () => {
  const baseParams = {
    clinicName: 'V-Health',
    channel: 'web' as const,
  }

  it('includes persona with clinic name', () => {
    const prompt = buildSystemPrompt(baseParams)
    expect(prompt).toContain('recovery coach for V-Health')
    expect(prompt).toContain('V-Health Coach')
  })

  it('includes all 7 guardrail rules', () => {
    const prompt = buildSystemPrompt(baseParams)
    expect(prompt).toContain('Never diagnose')
    expect(prompt).toContain('Never prescribe new exercises')
    expect(prompt).toContain('defer medical questions')
    expect(prompt).toContain('pain >= 8')
    expect(prompt).toContain('Stay on-topic')
    expect(prompt).toContain('specific metrics')
    expect(prompt).toContain('confirm with')
  })

  it('includes bilingual rules', () => {
    const prompt = buildSystemPrompt(baseParams)
    expect(prompt).toContain('Respond in the language the patient uses')
    expect(prompt).toContain('metric data in English')
  })

  it('includes metric collection behavior', () => {
    const prompt = buildSystemPrompt(baseParams)
    expect(prompt).toContain('log_metrics')
    expect(prompt).toContain('discomfort on a scale of 0 to 3')
  })

  it('includes patient name when provided', () => {
    const prompt = buildSystemPrompt({ ...baseParams, patientName: 'Alice' })
    expect(prompt).toContain('Alice')
  })

  it('includes condition when provided', () => {
    const prompt = buildSystemPrompt({ ...baseParams, patientCondition: 'lower back pain' })
    expect(prompt).toContain('lower back pain')
  })

  it('uses practitioner name when provided', () => {
    const prompt = buildSystemPrompt({ ...baseParams, practitionerName: 'Dr. Lee' })
    expect(prompt).toContain('Dr. Lee')
  })

  it('uses generic practitioner when not provided', () => {
    const prompt = buildSystemPrompt(baseParams)
    expect(prompt).toContain('your practitioner')
  })

  it('handles missing optional fields without errors', () => {
    expect(() => buildSystemPrompt(baseParams)).not.toThrow()
    const prompt = buildSystemPrompt(baseParams)
    expect(prompt).not.toContain('undefined')
    expect(prompt).not.toContain('null')
  })

  describe('SMS mode', () => {
    it('includes length constraints for SMS', () => {
      const prompt = buildSystemPrompt({ ...baseParams, channel: 'sms' })
      expect(prompt).toContain('280 characters')
      expect(prompt).toContain('warm but brief')
    })

    it('does not include SMS rules for web channel', () => {
      const prompt = buildSystemPrompt({ ...baseParams, channel: 'web' })
      expect(prompt).not.toContain('280 characters')
    })
  })

  describe('scale education', () => {
    it('includes scale legends for new patients (0 conversations)', () => {
      const prompt = buildSystemPrompt({ ...baseParams, conversationCount: 0 })
      expect(prompt).toContain('barely noticeable')
      expect(prompt).toContain('worst imaginable')
    })

    it('includes scale legends for 2 conversations', () => {
      const prompt = buildSystemPrompt({ ...baseParams, conversationCount: 2 })
      expect(prompt).toContain('barely noticeable')
    })

    it('excludes scale legends after 3 conversations', () => {
      const prompt = buildSystemPrompt({ ...baseParams, conversationCount: 5 })
      expect(prompt).not.toContain('barely noticeable')
    })
  })

  describe('language preference', () => {
    it('mentions Chinese preference when language is zh', () => {
      const prompt = buildSystemPrompt({ ...baseParams, patientLanguage: 'zh' })
      expect(prompt).toContain('Chinese')
    })

    it('mentions English preference when language is en', () => {
      const prompt = buildSystemPrompt({ ...baseParams, patientLanguage: 'en' })
      expect(prompt).toContain('English')
    })
  })
})
