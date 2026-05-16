import { describe, it, expect } from 'vitest'
import { buildReviewEmailHtml, buildReviewEmailSubject } from '../templates/email'
import { buildReviewSmsBody } from '../templates/sms'

describe('email template', () => {
  it('subject includes clinic name', () => {
    const subj = buildReviewEmailSubject({ clinicName: 'V-Health Rehab Clinic', patientName: 'Alice' })
    expect(subj).toMatch(/V-Health Rehab Clinic/)
  })

  it('html includes patient name, sender name, short link, and unsubscribe link', () => {
    const html = buildReviewEmailHtml({
      clinicName: 'V-Health Rehab Clinic',
      senderName: 'V-Health',
      patientName: 'Alice',
      shortLink: 'https://x/review/abc',
      unsubscribeLink: 'https://x/api/review/unsubscribe?token=abc',
    })
    expect(html).toContain('Alice')
    expect(html).toContain('V-Health')
    expect(html).toContain('https://x/review/abc')
    expect(html).toContain('unsubscribe')
  })
})

describe('sms template', () => {
  it('builds a body under 160 chars including the link and STOP footer', () => {
    const body = buildReviewSmsBody({
      senderName: 'V-Health',
      patientName: 'Alice',
      shortLink: 'https://x/review/abc',
    })
    expect(body.length).toBeLessThanOrEqual(160)
    expect(body).toContain('V-Health')
    expect(body).toContain('https://x/review/abc')
    expect(body).toContain('STOP')
  })

  it('truncates patient name if total length would exceed 160', () => {
    const body = buildReviewSmsBody({
      senderName: 'A-Very-Long-Clinic-Name-Indeed',
      patientName: 'Alexandra Magdalena Christopherson the Third',
      shortLink: 'https://example.com/review/aaaaaaaaaaaaaaaaaaaa',
    })
    expect(body.length).toBeLessThanOrEqual(160)
  })
})
