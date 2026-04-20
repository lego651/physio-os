import { describe, it, expect } from 'vitest'
import { buildWidgetSystemPrompt } from '../system-prompt'
import type { ClinicKB } from '../knowledge-base'

const kb: ClinicKB = {
  clinic: {
    id: 'c', name: 'V-Health', domain: 'vhealth.ca', janeapp_base_url: 'https://vhealthc.janeapp.com/#/staff_member',
    hours: 'Mon–Fri', address: 'x', phone: '403', email: 'e', insurance: 'all', cancellation: '24h',
    services: ['Massage'],
  },
  therapists: [
    { id: 't1', name: 'Wendy Chen', role: 'RMT', bio: 'deep tissue',
      janeapp_staff_id: 13, specialties: ['deep tissue'], languages: ['English'],
      bookingUrl: 'https://vhealthc.janeapp.com/#/staff_member/13' },
  ],
}

describe('buildWidgetSystemPrompt', () => {
  it('includes clinic name and therapist names', () => {
    const p = buildWidgetSystemPrompt(kb)
    expect(p).toContain('V-Health')
    expect(p).toContain('Wendy Chen')
  })
  it('includes each booking URL', () => {
    expect(buildWidgetSystemPrompt(kb)).toContain('/staff_member/13')
  })
  it('includes response envelope instruction', () => {
    expect(buildWidgetSystemPrompt(kb)).toMatch(/"on_topic"/)
  })
  it('forbids hallucinated pricing', () => {
    expect(buildWidgetSystemPrompt(kb).toLowerCase()).toContain('pricing')
  })
  it('instructs to reply in user language', () => {
    expect(buildWidgetSystemPrompt(kb).toLowerCase()).toContain('language')
  })
})
