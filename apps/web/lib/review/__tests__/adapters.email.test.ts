import { describe, it, expect, beforeEach, vi } from 'vitest'
import { EmailAdapter } from '../adapters/email'

describe('EmailAdapter', () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = 'test-key'
  })

  it('posts to Resend with the expected payload and returns providerMessageId', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'resend-msg-1' }),
    })
    const adapter = new EmailAdapter({ fetch: fetchMock as unknown as typeof globalThis.fetch })
    const out = await adapter.send({
      to: 'patient@example.com',
      from: 'V-Health <onboarding@resend.dev>',
      subject: 'subject',
      html: '<p>hi</p>',
    })
    expect(out.providerMessageId).toBe('resend-msg-1')
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.resend.com/emails')
    expect(JSON.parse(opts.body as string)).toMatchObject({
      to: 'patient@example.com',
      subject: 'subject',
    })
  })

  it('throws on non-2xx with the body included', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => 'invalid recipient',
    })
    const adapter = new EmailAdapter({ fetch: fetchMock as unknown as typeof globalThis.fetch })
    await expect(adapter.send({ to: 'x', from: 'y', subject: 's', html: 'h' })).rejects.toThrow(
      /422.*invalid recipient/,
    )
  })
})
