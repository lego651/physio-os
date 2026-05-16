'use client'
// apps/web/app/review/[token]/ReviewClient.tsx
import { useState } from 'react'

interface Props {
  token: string
  patientName: string
  clinicName: string
  mapsHref: string
}

async function track(token: string, eventType: string) {
  try {
    await fetch('/api/review-requests/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, eventType }),
    })
  } catch { /* swallow — tracking is best-effort */ }
}

export default function ReviewClient(props: Props) {
  const [keywords, setKeywords] = useState('')
  const [draft, setDraft] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function generate() {
    if (!keywords.trim()) return
    setLoading(true); setErr(null); setDraft(null)
    try {
      const res = await fetch('/api/review-requests/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: props.token, keywords }),
      })
      if (!res.ok) { setErr('Could not generate a draft. Please try again.'); return }
      const json = await res.json()
      setDraft(json.draft)
    } catch { setErr('Network error.') } finally { setLoading(false) }
  }

  async function copy() {
    if (!draft) return
    await navigator.clipboard.writeText(draft)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
    void track(props.token, 'copy_clicked')
  }

  function openMaps() {
    void track(props.token, 'maps_redirected')
    window.open(props.mapsHref, '_blank', 'noopener,noreferrer')
  }

  const firstName = props.patientName.split(/\s+/)[0]

  return (
    <main style={{ maxWidth: 540, margin: '0 auto', padding: '40px 20px', fontFamily: '-apple-system,system-ui,sans-serif', color: '#1a1a1a' }}>
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>Hi {firstName} 👋</h1>
      <p style={{ color: '#6b7280', lineHeight: 1.6 }}>
        Thanks for visiting <strong>{props.clinicName}</strong>. Want help writing a quick Google review?
        Type a few words about your visit and we&apos;ll draft one for you. Takes 30 seconds.
      </p>

      <label style={{ display: 'block', marginTop: 24, marginBottom: 8, fontWeight: 600 }}>
        Your notes (e.g. &quot;neck pain, much better, three sessions&quot;)
      </label>
      <textarea
        value={keywords}
        onChange={e => setKeywords(e.target.value)}
        rows={3}
        maxLength={500}
        style={{ width: '100%', padding: 12, fontSize: 16, border: '1px solid #e5e7eb', borderRadius: 8 }}
      />

      <button
        onClick={generate}
        disabled={loading || !keywords.trim()}
        style={{ marginTop: 12, background: '#2563eb', color: '#fff', padding: '12px 24px', border: 'none', borderRadius: 8, fontSize: 16, cursor: 'pointer', opacity: loading || !keywords.trim() ? 0.6 : 1 }}
      >
        {loading ? 'Drafting…' : 'Generate review'}
      </button>

      {err && <p role="alert" style={{ color: '#dc2626', marginTop: 12 }}>{err}</p>}

      {draft && (
        <section style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 18, marginBottom: 8 }}>Your draft</h2>
          <div style={{ background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
            {draft}
          </div>
          <div style={{ marginTop: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button onClick={copy} style={{ background: '#1a1a1a', color: '#fff', padding: '10px 20px', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
              {copied ? 'Copied ✓' : 'Copy draft'}
            </button>
            <button onClick={openMaps} style={{ background: '#059669', color: '#fff', padding: '10px 20px', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
              Open Google Maps
            </button>
          </div>
          <p style={{ color: '#6b7280', fontSize: 13, marginTop: 16 }}>
            Tip: tap <strong>Copy draft</strong>, then <strong>Open Google Maps</strong>, and paste it into Google&apos;s review form.
          </p>
        </section>
      )}
    </main>
  )
}
