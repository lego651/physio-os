import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Module mocks — must be set up before importing the module under test
// ---------------------------------------------------------------------------

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}))

import * as Sentry from '@sentry/nextjs'
import { sendEmergencyAlert } from '../lib/email/send-emergency-alert'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_PARAMS = {
  patientName: 'Jane Doe',
  patientPhone: '+16045550001',
  triggeringMessage: 'I have the worst pain, 10/10, can\'t move at all.',
  timestamp: '2026-04-03T12:00:00.000Z',
  channel: 'web' as const,
}

function makeEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    RESEND_API_KEY: 're_test_key',
    ADMIN_EMAIL: 'admin@vhealth.ai',
    CLINIC_NAME: 'V-Health',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('sendEmergencyAlert', () => {
  const originalFetch = global.fetch
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(new Response('{"id":"email_123"}', { status: 200 }))
    global.fetch = fetchMock
  })

  afterEach(() => {
    global.fetch = originalFetch
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it('sends a POST to Resend with correct headers and subject when config is present', async () => {
    const env = makeEnv()
    vi.stubEnv('RESEND_API_KEY', env.RESEND_API_KEY!)
    vi.stubEnv('ADMIN_EMAIL', env.ADMIN_EMAIL!)
    vi.stubEnv('CLINIC_NAME', env.CLINIC_NAME!)

    await sendEmergencyAlert(BASE_PARAMS)

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.resend.com/emails')
    expect(options.method).toBe('POST')

    const headers = options.headers as Record<string, string>
    expect(headers['Authorization']).toBe(`Bearer ${env.RESEND_API_KEY}`)
    expect(headers['Content-Type']).toBe('application/json')

    const body = JSON.parse(options.body as string)
    expect(body.to).toEqual([env.ADMIN_EMAIL])
    expect(body.subject).toContain('Patient Emergency Alert')
    expect(body.html).toContain(BASE_PARAMS.patientName)
    expect(body.html).toContain(BASE_PARAMS.patientPhone)
    expect(body.text).toContain(BASE_PARAMS.triggeringMessage)
  })

  it('includes channel label "Web Chat" for web channel', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test_key')
    vi.stubEnv('ADMIN_EMAIL', 'admin@vhealth.ai')

    await sendEmergencyAlert({ ...BASE_PARAMS, channel: 'web' })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body.html).toContain('Web Chat')
    expect(body.text).toContain('Web Chat')
  })

  it('includes channel label "SMS" for sms channel', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test_key')
    vi.stubEnv('ADMIN_EMAIL', 'admin@vhealth.ai')

    await sendEmergencyAlert({ ...BASE_PARAMS, channel: 'sms' })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body.html).toContain('SMS')
    expect(body.text).toContain('SMS')
  })

  it('renders "(unknown)" when patientName is null', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test_key')
    vi.stubEnv('ADMIN_EMAIL', 'admin@vhealth.ai')

    await sendEmergencyAlert({ ...BASE_PARAMS, patientName: null })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body.html).toContain('(unknown)')
    expect(body.text).toContain('(unknown)')
  })

  it('does not call fetch when RESEND_API_KEY is missing', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    vi.stubEnv('ADMIN_EMAIL', 'admin@vhealth.ai')

    await sendEmergencyAlert(BASE_PARAMS)

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not call fetch when ADMIN_EMAIL is missing', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test_key')
    vi.stubEnv('ADMIN_EMAIL', '')

    await sendEmergencyAlert(BASE_PARAMS)

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('captures Sentry exception and does NOT throw when Resend returns an error', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test_key')
    vi.stubEnv('ADMIN_EMAIL', 'admin@vhealth.ai')

    fetchMock.mockResolvedValueOnce(new Response('{"message":"API error"}', { status: 422 }))

    // Must not throw — patient response must never be blocked
    await expect(sendEmergencyAlert(BASE_PARAMS)).resolves.toBeUndefined()

    expect(Sentry.captureException).toHaveBeenCalledOnce()
  })

  it('captures Sentry exception and does NOT throw when fetch itself throws (network error)', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test_key')
    vi.stubEnv('ADMIN_EMAIL', 'admin@vhealth.ai')

    fetchMock.mockRejectedValueOnce(new Error('Network failure'))

    await expect(sendEmergencyAlert(BASE_PARAMS)).resolves.toBeUndefined()

    expect(Sentry.captureException).toHaveBeenCalledOnce()
  })

  it('HTML-escapes special characters in patient name and message', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test_key')
    vi.stubEnv('ADMIN_EMAIL', 'admin@vhealth.ai')

    await sendEmergencyAlert({
      ...BASE_PARAMS,
      patientName: '<script>alert("xss")</script>',
      triggeringMessage: 'Pain & discomfort > threshold',
    })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body.html).not.toContain('<script>')
    expect(body.html).toContain('&lt;script&gt;')
    expect(body.html).toContain('&amp;')
    expect(body.html).toContain('&gt;')
  })

  it('includes Chinese emergency phrases in the email body without escaping CJK', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test_key')
    vi.stubEnv('ADMIN_EMAIL', 'admin@vhealth.ai')

    const chineseMessage = '痛死了，受不了，想死'
    await sendEmergencyAlert({ ...BASE_PARAMS, triggeringMessage: chineseMessage })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body.text).toContain(chineseMessage)
  })
})
