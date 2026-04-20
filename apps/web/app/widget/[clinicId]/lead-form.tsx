'use client'
import { useState } from 'react'

const CONSENT_TEXT = 'I consent to be contacted by V-Health Rehab Clinic by email, phone, or text regarding my appointment request.'

export function LeadForm({ token, onDone }: {
  token: string; onDone: () => void
}) {
  const [name, setName] = useState(''); const [phone, setPhone] = useState('')
  const [email, setEmail] = useState(''); const [interest, setInterest] = useState('')
  const [consent, setConsent] = useState(false); const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(null); setSubmitting(true)
    try {
      const res = await fetch('/api/widget/lead', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token, name, phone, email, interest,
          consentGiven: consent, consentText: CONSENT_TEXT,
        }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? 'Failed') }
      onDone()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed') }
    finally { setSubmitting(false) }
  }

  return (
    <form onSubmit={submit} className="rounded border p-3 space-y-2 bg-gray-50">
      <div className="font-semibold text-sm">Leave your contact — we'll reach out</div>
      <input required placeholder="Your name *" value={name} onChange={e => setName(e.target.value)} className="w-full rounded border px-2 py-1" />
      <input placeholder="Phone" value={phone} onChange={e => setPhone(e.target.value)} className="w-full rounded border px-2 py-1" />
      <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} className="w-full rounded border px-2 py-1" />
      <input placeholder="What brings you in?" value={interest} onChange={e => setInterest(e.target.value)} className="w-full rounded border px-2 py-1" />
      <label className="flex items-start gap-2 text-xs">
        <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-0.5" required />
        <span>{CONSENT_TEXT}</span>
      </label>
      {err && <div className="text-red-600 text-sm">{err}</div>}
      <button type="submit" disabled={!consent || !name || (!phone && !email) || submitting}
        className="w-full rounded bg-blue-600 py-2 text-white disabled:opacity-50">
        {submitting ? 'Sending…' : 'Submit'}
      </button>
    </form>
  )
}
