import { describe, it, expect } from 'vitest'
import { buildReviewEmailHtml, buildReviewEmailSubject } from '../templates/email'
import { buildReviewSmsBody } from '../templates/sms'

describe('email template', () => {
  it('subject includes clinic name', () => {
    const subj = buildReviewEmailSubject({
      clinicName: 'V-Health Rehab Clinic',
      patientName: 'Alice',
    })
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
  it('builds a body containing the link, sender, first name, and STOP footer', () => {
    const body = buildReviewSmsBody({
      senderName: 'V-Health',
      patientName: 'Alice',
      shortLink: 'https://x/review/abc',
    })
    expect(body).toContain('V-Health')
    expect(body).toContain('Alice')
    expect(body).toContain('https://x/review/abc')
    expect(body).toContain('STOP')
  })

  it('NEVER truncates — full URL must survive even when body exceeds 160 chars (multi-segment SMS)', () => {
    const longLink = 'https://example.com/review/' + 'a'.repeat(250)
    const body = buildReviewSmsBody({
      senderName: 'V-Health Rehab Clinic',
      patientName: 'Alexandra Magdalena',
      shortLink: longLink,
    })
    expect(body).toContain(longLink)
    expect(body.length).toBeGreaterThan(160)
  })
})
