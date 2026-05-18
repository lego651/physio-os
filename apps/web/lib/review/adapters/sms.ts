// apps/web/lib/review/adapters/sms.ts

const TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01'

export interface SmsSendInput {
  to: string
  body: string
}

export interface SmsSendResult {
  providerMessageId: string
}

export interface SmsAdapterDeps {
  fetch?: typeof globalThis.fetch
}

export class SmsAdapter {
  private readonly fetchImpl: typeof globalThis.fetch

  constructor(deps: SmsAdapterDeps = {}) {
    this.fetchImpl = deps.fetch ?? globalThis.fetch
  }

  async send(input: SmsSendInput): Promise<SmsSendResult> {
    const sid = process.env.TWILIO_ACCOUNT_SID
    const token = process.env.TWILIO_AUTH_TOKEN
    const from = process.env.TWILIO_PHONE_NUMBER
    if (!sid || !token || !from) {
      throw new Error(
        'Missing Twilio configuration (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER)',
      )
    }

    const formData = new URLSearchParams()
    formData.set('To', input.to)
    formData.set('From', from)
    formData.set('Body', input.body)

    const url = `${TWILIO_API_BASE}/Accounts/${sid}/Messages.json`
    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    })

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Twilio send failed: ${res.status} ${body}`)
    }

    const data = (await res.json()) as { sid: string }
    return { providerMessageId: data.sid }
  }
}
