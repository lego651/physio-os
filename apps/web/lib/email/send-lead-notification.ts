import * as Sentry from '@sentry/nextjs'

export interface LeadEmailParams {
  clinicName: string; clinicEmail: string
  leadName: string; leadEmail?: string | null; leadPhone?: string | null; interest?: string | null
  transcriptSnippet: string
  consentText: string
  createdAt: string
}

const RESEND_API_URL = 'https://api.resend.com/emails'

export async function sendLeadNotification(p: LeadEmailParams): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) { console.warn('[widget-lead] RESEND_API_KEY missing — skipping email'); return false }

  const subject = `New lead via chatbot — ${p.leadName}`
  const html = `<h2>New lead from chatbot</h2>
<p><strong>Name:</strong> ${p.leadName}</p>
<p><strong>Phone:</strong> ${p.leadPhone ?? '—'}</p>
<p><strong>Email:</strong> ${p.leadEmail ?? '—'}</p>
<p><strong>Interest:</strong> ${p.interest ?? '—'}</p>
<p><strong>Captured:</strong> ${p.createdAt}</p>
<h3>Conversation snippet</h3>
<pre style="white-space:pre-wrap">${p.transcriptSnippet}</pre>
<h3>Consent</h3>
<p>${p.consentText}</p>`

  try {
    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: `${p.clinicName} <onboarding@resend.dev>`, to: p.clinicEmail, subject, html }),
    })
    if (!res.ok) { Sentry.captureMessage(`lead email failed: ${res.status}`, 'warning'); return false }
    return true
  } catch (e) { Sentry.captureException(e, { tags: { component: 'widget-lead-email' } }); return false }
}
