'use client'
// apps/web/app/r/ai/AiReviewClient.tsx

import { useState } from 'react'

interface Props {
  token: string
  firstName: string
  initialDraft: string
  mapsUrl: string
}

export default function AiReviewClient({ token, firstName, initialDraft, mapsUrl }: Props) {
  const [draft, setDraft] = useState(initialDraft)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [notesOpen, setNotesOpen] = useState(false)
  const [notes, setNotes] = useState('')

  async function regenerate(withNotes?: string) {
    setLoading(true)
    setErr(null)
    try {
      const res = await fetch('/api/review/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, notes: withNotes ?? undefined }),
      })
      if (!res.ok) {
        setErr('Could not regenerate. Please try again.')
        return
      }
      const json = await res.json()
      setDraft(json.draft)
      // Best-effort tracking
      fetch('/api/review/draft/track-copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, event: 'regenerated' }),
      }).catch(() => { /* best-effort */ })
    } catch {
      setErr('Network error.')
    } finally {
      setLoading(false)
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(draft)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
    fetch('/api/review/draft/track-copy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, event: 'copied' }),
    }).catch(() => { /* best-effort */ })
    window.open(mapsUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <main style={{ maxWidth: 540, margin: '0 auto', padding: '40px 20px', fontFamily: '-apple-system,system-ui,sans-serif', color: '#1a1a1a' }}>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>Hi {firstName} — Thanks for visiting V-Health Rehab Clinic</h1>
      <p style={{ color: '#6b7280', lineHeight: 1.6, marginTop: 0 }}>
        Here&apos;s a draft Google review we wrote for you. Copy it and paste on Google Maps — takes 30 seconds.
      </p>

      <div style={{ background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginTop: 20, whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
        {draft}
      </div>

      {err && <p role="alert" style={{ color: '#dc2626', marginTop: 10, fontSize: 14 }}>{err}</p>}

      <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button
          onClick={copy}
          disabled={loading}
          style={{ background: '#2563eb', color: '#fff', padding: '12px 22px', border: 'none', borderRadius: 8, fontSize: 16, cursor: 'pointer', opacity: loading ? 0.6 : 1 }}
        >
          {copied ? 'Copied!' : 'Copy & open Google Maps'}
        </button>
        <button
          onClick={() => regenerate()}
          disabled={loading}
          style={{ background: '#f3f4f6', color: '#1a1a1a', padding: '12px 18px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 15, cursor: 'pointer', opacity: loading ? 0.6 : 1 }}
        >
          {loading ? 'Regenerating…' : 'Regenerate'}
        </button>
      </div>

      <div style={{ marginTop: 20, borderTop: '1px solid #e5e7eb', paddingTop: 12 }}>
        <button
          onClick={() => setNotesOpen((o) => !o)}
          style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: 14, cursor: 'pointer', padding: 0 }}
        >
          {notesOpen ? '▲ Hide' : '▼ Want to add your own words?'}
        </button>
        {notesOpen && (
          <div style={{ marginTop: 10 }}>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="e.g. back pain, 3 sessions, felt great after"
              style={{ width: '100%', padding: 10, fontSize: 15, border: '1px solid #e5e7eb', borderRadius: 8, boxSizing: 'border-box' }}
            />
            <button
              onClick={() => regenerate(notes)}
              disabled={loading || !notes.trim()}
              style={{ marginTop: 8, background: '#1a1a1a', color: '#fff', padding: '10px 18px', border: 'none', borderRadius: 8, fontSize: 14, cursor: 'pointer', opacity: loading || !notes.trim() ? 0.6 : 1 }}
            >
              Regenerate with these notes
            </button>
          </div>
        )}
      </div>

      <p style={{ marginTop: 24, color: '#6b7280', fontSize: 13 }}>
        Don&apos;t forget: code <strong>JG</strong> = 10% off your next visit.
      </p>
    </main>
  )
}
