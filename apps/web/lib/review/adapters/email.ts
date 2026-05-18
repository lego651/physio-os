// apps/web/lib/review/adapters/email.ts

const RESEND_API_URL = 'https://api.resend.com/emails'

export interface EmailSendInput {
  to: string
  from: string
  subject: string
  html: string
  headers?: Record<string, string>
}

export interface EmailSendResult {
  providerMessageId: string
}

export interface EmailAdapterDeps {
  fetch?: typeof globalThis.fetch
}

export class EmailAdapter {
  private readonly fetchImpl: typeof globalThis.fetch

  constructor(deps: EmailAdapterDeps = {}) {
    this.fetchImpl = deps.fetch ?? globalThis.fetch
  }

  async send(input: EmailSendInput): Promise<EmailSendResult> {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) throw new Error('Missing RESEND_API_KEY')

    const res = await this.fetchImpl(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(input.headers ?? {}),
      },
      body: JSON.stringify({
        from: input.from,
        to: input.to,
        subject: input.subject,
        html: input.html,
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Resend send failed: ${res.status} ${body}`)
    }

    const data = (await res.json()) as { id: string }
    return { providerMessageId: data.id }
  }
}
