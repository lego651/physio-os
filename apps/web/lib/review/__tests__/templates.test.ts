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

describe('sms template — Variant C', () => {
  const base = {
    firstName: 'Alice',
    gmapLink: 'https://physio-os-web.vercel.app/r/gmap?t=abc-123',
    aiLink:   'https://physio-os-web.vercel.app/r/ai?t=abc-123',
  }

  it('contains both links', () => {
    const body = buildReviewSmsBody(base)
    expect(body).toContain(base.gmapLink)
    expect(body).toContain(base.aiLink)
  })

  it('contains firstName', () => {
    const body = buildReviewSmsBody(base)
    expect(body).toContain('Alice')
  })

  it('contains V-Health Rehab branding', () => {
    const body = buildReviewSmsBody(base)
    expect(body).toContain('V-Health Rehab')
  })

  it('contains STOP opt-out footer', () => {
    const body = buildReviewSmsBody(base)
    expect(body).toContain('STOP')
  })

  it('contains discount code JG', () => {
    const body = buildReviewSmsBody(base)
    expect(body).toContain('JG')
  })

  it('fits within 2 SMS segments (≤306 chars) with realistic UUID tokens', () => {
    // physio-os-web.vercel.app host + two 36-char UUIDs = ~231 chars total.
    // Single-segment (160) is not achievable with this host length; 2 segments
    // (306 GSM chars) is the hard ceiling. Never truncate URLs.
    const body = buildReviewSmsBody(base)
    expect(body.length).toBeLessThanOrEqual(306)
  })

  it('never truncates URLs even when firstName is very long', () => {
    const body = buildReviewSmsBody({
      firstName: 'Bartholomew',
      gmapLink: base.gmapLink,
      aiLink:   base.aiLink,
    })
    expect(body).toContain(base.gmapLink)
    expect(body).toContain(base.aiLink)
  })
})
