import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SmsAdapter } from '../adapters/sms'

describe('SmsAdapter', () => {
  beforeEach(() => {
    process.env.TWILIO_ACCOUNT_SID = 'AC_test'
    process.env.TWILIO_AUTH_TOKEN = 'token_test'
    process.env.TWILIO_PHONE_NUMBER = '+15005550006'
  })

  it('posts to Twilio Messages API and returns providerMessageId', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ sid: 'SM_test_1' }),
    })
    const adapter = new SmsAdapter({ fetch: fetchMock as unknown as typeof globalThis.fetch })
    const out = await adapter.send({ to: '+14035550100', body: 'hi' })
    expect(out.providerMessageId).toBe('SM_test_1')
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toMatch(/AC_test\/Messages\.json$/)
    expect(opts.body as string).toContain('To=%2B14035550100')
    expect(opts.body as string).toContain('Body=hi')
  })

  it('throws on non-2xx response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'bad number',
    })
    const adapter = new SmsAdapter({ fetch: fetchMock as unknown as typeof globalThis.fetch })
    await expect(adapter.send({ to: '+1', body: 'hi' })).rejects.toThrow(/400.*bad number/)
  })

  it('throws when Twilio responds 2xx but status=failed (e.g. trial 30044)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        sid: 'SM_fail_1',
        status: 'failed',
        error_code: 30044,
        error_message: 'Trial Message Length Exceeded',
      }),
    })
    const adapter = new SmsAdapter({ fetch: fetchMock as unknown as typeof globalThis.fetch })
    await expect(adapter.send({ to: '+14035550100', body: 'hi' })).rejects.toThrow(
      /status=failed.*30044/i,
    )
  })

  it('throws when Twilio responds 2xx but status=undelivered', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        sid: 'SM_fail_2',
        status: 'undelivered',
        error_code: 30003,
        error_message: 'Unreachable destination handset',
      }),
    })
    const adapter = new SmsAdapter({ fetch: fetchMock as unknown as typeof globalThis.fetch })
    await expect(adapter.send({ to: '+14035550100', body: 'hi' })).rejects.toThrow(
      /status=undelivered.*30003/i,
    )
  })

  it('throws when Twilio responds 2xx but status=canceled', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        sid: 'SM_fail_3',
        status: 'canceled',
        error_code: null,
        error_message: null,
      }),
    })
    const adapter = new SmsAdapter({ fetch: fetchMock as unknown as typeof globalThis.fetch })
    await expect(adapter.send({ to: '+14035550100', body: 'hi' })).rejects.toThrow(
      /status=canceled/i,
    )
  })

  it('succeeds when Twilio responds 2xx with status=queued', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        sid: 'SM_queued_1',
        status: 'queued',
        error_code: null,
        error_message: null,
      }),
    })
    const adapter = new SmsAdapter({ fetch: fetchMock as unknown as typeof globalThis.fetch })
    const out = await adapter.send({ to: '+14035550100', body: 'hi' })
    expect(out.providerMessageId).toBe('SM_queued_1')
  })
})
