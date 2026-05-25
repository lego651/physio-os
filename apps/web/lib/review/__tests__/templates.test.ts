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

  // ── New CTA wording spec (Option C redesign) ────────────────────────────
  it('primary CTA button says "Leave a quick Google review"', () => {
    const html = buildReviewEmailHtml(BASE_EMAIL)
    expect(html).toContain('Leave a quick Google review')
  })

  it('secondary CTA button says "One tap to help us"', () => {
    const html = buildReviewEmailHtml(BASE_EMAIL)
    expect(html).toContain('One tap to help us')
  })

  it('primary CTA has larger padding than secondary CTA (visual weight)', () => {
    const html = buildReviewEmailHtml(BASE_EMAIL)
    // Primary: padding:14px 24px  Secondary: padding:10px 18px
    // We verify both padding strings exist and primary appears first
    const primaryPaddingMatch = html.match(/padding:[^;]*14px[^;]*24px/)
    const secondaryPaddingMatch = html.match(/padding:[^;]*10px[^;]*18px/)
    expect(primaryPaddingMatch).not.toBeNull()
    expect(secondaryPaddingMatch).not.toBeNull()
    expect(html.indexOf('Leave a quick Google review')).toBeLessThan(html.indexOf('One tap to help us'))
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
    expect(text).toContain(BASE_EMAIL.gmapLink)
    expect(text).toContain(BASE_EMAIL.aiLink)
    expect(text).toContain('JG')
  })

  // ── New CTA wording spec (Option C redesign) ────────────────────────────
  it('plain text primary CTA uses "Leave a quick Google review" wording', () => {
    const text = buildReviewEmailText(BASE_EMAIL)
    expect(text).toContain('Leave a quick Google review')
  })

  it('plain text secondary CTA uses "One tap to help us" wording', () => {
    const text = buildReviewEmailText(BASE_EMAIL)
    expect(text).toContain('One tap to help us')
  })

  it('does NOT use "Option A" or "Option B" labels in plain text', () => {
    const text = buildReviewEmailText(BASE_EMAIL)
    expect(text).not.toContain('Option A')
    expect(text).not.toContain('Option B')
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

  it('contains STOP opt-out footer as its own complete sentence on its own line', () => {
    const body = buildReviewSmsBody(base)
    expect(body).toContain('Reply STOP to opt out.')
    // Must be on its own line (blank line before it)
    expect(body).toMatch(/\n\nReply STOP to opt out\.$/)
  })

  it('contains grateful JG discount sentence (not bare "Code JG = 10%")', () => {
    const body = buildReviewSmsBody(base)
    expect(body).toContain('Thanks for your help!')
    expect(body).toContain('Use code JG for 10% off your next visit.')
    expect(body).not.toContain('Code JG = 10% off.')
  })

  it('fits within 3 SMS segments (≤459 chars) with realistic UUID tokens', () => {
    // IMPORTANT: test uses realistic 36-char UUID tokens (not abc-123 shorthand)
    // so this constraint actually validates the real-world SMS segment count.
    // Single-segment (160) is not achievable with this host length.
    // Grateful tone copy ("Thanks for your help! Use code JG for 10% off your next visit.\n\nReply STOP to opt out.")
    // adds ~53 chars over the old "Code JG = 10% off. Reply STOP." footer,
    // pushing the body to ~3 segments (459 GSM-7 chars max). This is intentional:
    // Jason confirmed paid Twilio account has no segment cost pressure.
    // Never truncate URLs.
    const realisticBase = {
      firstName: 'Alice',
      gmapLink: 'https://physio-os-web.vercel.app/r/gmap?t=07429f85-5b2f-4d92-97bf-5ca186b3651e',
      aiLink:   'https://physio-os-web.vercel.app/r/ai?t=07429f85-5b2f-4d92-97bf-5ca186b3651e',
    }
    const body = buildReviewSmsBody(realisticBase)
    expect(body.length).toBeLessThanOrEqual(459)
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

  // ── New wording spec (Option C redesign) ────────────────────────────────
  it('does NOT use "A)" or "B)" CTA labels', () => {
    const body = buildReviewSmsBody(base)
    expect(body).not.toContain('A)')
    expect(body).not.toContain('B)')
  })

  it('first CTA uses "Leave a quick Google review" wording', () => {
    const body = buildReviewSmsBody(base)
    expect(body).toContain('Leave a quick Google review')
  })

  it('second CTA uses "One tap to help us" wording (secondary assist)', () => {
    const body = buildReviewSmsBody(base)
    expect(body).toContain('One tap to help us')
  })

  it('Google review link appears before the AI link in the body', () => {
    const body = buildReviewSmsBody(base)
    expect(body.indexOf(base.gmapLink)).toBeLessThan(body.indexOf(base.aiLink))
  })
})
