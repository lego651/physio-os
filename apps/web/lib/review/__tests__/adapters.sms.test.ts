import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SmsAdapter } from '../adapters/sms'

describe('SmsAdapter', () => {
  beforeEach(() => {
    process.env.TWILIO_ACCOUNT_SID = 'AC_test'
    process.env.TWILIO_AUTH_TOKEN  = 'token_test'
    process.env.TWILIO_PHONE_NUMBER = '+15005550006'
  })

  it('posts to Twilio Messages API and returns providerMessageId', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 201,
      json: async () => ({ sid: 'SM_test_1' }),
    })
    const adapter = new SmsAdapter({ fetch: fetchMock as any })
    const out = await adapter.send({ to: '+14035550100', body: 'hi' })
    expect(out.providerMessageId).toBe('SM_test_1')
    const [url, opts] = fetchMock.mock.calls[0]
    expect((url as string)).toMatch(/AC_test\/Messages\.json$/)
    expect((opts as any).body).toContain('To=%2B14035550100')
    expect((opts as any).body).toContain('Body=hi')
  })

  it('throws on non-2xx response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false, status: 400,
      text: async () => 'bad number',
    })
    const adapter = new SmsAdapter({ fetch: fetchMock as any })
    await expect(adapter.send({ to: '+1', body: 'hi' })).rejects.toThrow(/400.*bad number/)
  })
})
