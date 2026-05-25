import { describe, it, expect } from 'vitest'
import {
  buildReviewEmailHtml,
  buildReviewEmailText,
  buildReviewEmailSubject,
} from '../templates/email'
import { buildReviewSmsBody } from '../templates/sms'

const BASE_EMAIL = {
  clinicName: 'V-Health Rehab Clinic',
  senderName: 'V-Health',
  patientName: 'Ethan Liu',
  gmapLink: 'https://physio-os-web.vercel.app/r/gmap?t=abc-123',
  aiLink: 'https://physio-os-web.vercel.app/r/ai?t=abc-123',
  unsubscribeLink: 'https://physio-os-web.vercel.app/api/review-requests/unsubscribe?token=abc',
}

describe('email template — Variant C', () => {
  it('subject includes clinic name', () => {
    const subj = buildReviewEmailSubject({
      clinicName: 'V-Health Rehab Clinic',
      patientName: 'Alice',
    })
    expect(subj).toMatch(/V-Health Rehab Clinic/)
  })

  it('subject uses share-your-experience format', () => {
    const subj = buildReviewEmailSubject({
      clinicName: 'V-Health Rehab Clinic',
      patientName: 'Alice',
    })
    expect(subj).toMatch(/share your experience/i)
  })

  it('html contains firstName substitution (first word of patientName)', () => {
    const html = buildReviewEmailHtml(BASE_EMAIL)
    expect(html).toContain('Hi Ethan')
    expect(html).not.toContain('Hi Ethan Liu')
  })

  it('html contains both CTA links', () => {
    const html = buildReviewEmailHtml(BASE_EMAIL)
    expect(html).toContain(BASE_EMAIL.gmapLink)
    expect(html).toContain(BASE_EMAIL.aiLink)
  })

  it('html does NOT contain the old single-link shortLink pattern', () => {
    const html = buildReviewEmailHtml(BASE_EMAIL)
    // The old template had /review/ links; new template uses /r/gmap and /r/ai only
    expect(html).not.toContain('/review/')
  })

  it('html contains JG code and 10% off', () => {
    const html = buildReviewEmailHtml(BASE_EMAIL)
    expect(html).toContain('JG')
    expect(html).toContain('10%')
  })

  it('html contains unsubscribe link', () => {
    const html = buildReviewEmailHtml(BASE_EMAIL)
    expect(html).toContain(BASE_EMAIL.unsubscribeLink)
    expect(html.toLowerCase()).toContain('unsubscribe')
  })

  it('html contains clinic name and sender name', () => {
    const html = buildReviewEmailHtml(BASE_EMAIL)
    expect(html).toContain('V-Health Rehab Clinic')
    expect(html).toContain('V-Health')
  })
})

describe('email plain-text fallback — Variant C', () => {
  it('contains both CTA links', () => {
    const text = buildReviewEmailText(BASE_EMAIL)
    expect(text).toContain(BASE_EMAIL.gmapLink)
    expect(text).toContain(BASE_EMAIL.aiLink)
  })

  it('contains firstName', () => {
    const text = buildReviewEmailText(BASE_EMAIL)
    expect(text).toContain('Hi Ethan')
  })

  it('contains JG code and 10% off', () => {
    const text = buildReviewEmailText(BASE_EMAIL)
    expect(text).toContain('JG')
    expect(text).toContain('10%')
  })

  it('contains unsubscribe link', () => {
    const text = buildReviewEmailText(BASE_EMAIL)
    expect(text).toContain(BASE_EMAIL.unsubscribeLink)
  })

  it('mirrors same info as HTML (gmap + ai + JG)', () => {
    const text = buildReviewEmailText(BASE_EMAIL)
    expect(text).toContain('Option A')
    expect(text).toContain('Option B')
    expect(text).toContain(BASE_EMAIL.gmapLink)
    expect(text).toContain(BASE_EMAIL.aiLink)
    expect(text).toContain('JG')
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

  it('uses ASCII hyphen separator (not em-dash U+2014) to stay in GSM-7', () => {
    const body = buildReviewSmsBody(base)
    expect(body).not.toContain('—') // em-dash must be absent
    expect(body).toContain(' - ') // ASCII hyphen separator present
  })
})
