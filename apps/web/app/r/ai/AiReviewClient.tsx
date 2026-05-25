'use client'
// apps/web/app/r/ai/AiReviewClient.tsx
//
// Dynamic chip-driven AI review flow.
// No pre-generated draft — AI is invoked only when patient clicks "Generate review".

import { useState } from 'react'

const STATIC_FEELINGS = ['Amazing', 'Professional', 'Felt better', 'Highly recommend', 'Calm', 'Kind']

interface Props {
  token: string
  firstName: string
  dynamicChips: string[]
  mapsUrl: string
}

export default function AiReviewClient({ token, firstName, dynamicChips, mapsUrl }: Props) {
  // Dynamic facts from intake_records (therapist, treatment area, session type)
  // are pre-selected — they're true facts about this patient's visit; user only
  // needs to deselect what they don't want to mention. Static feelings start blank.
  const [selectedFacts, setSelectedFacts] = useState<Set<string>>(() => new Set(dynamicChips))
  const [selectedFeelings, setSelectedFeelings] = useState<Set<string>>(new Set())
  const [notes, setNotes] = useState('')
  const [draft, setDraft] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const hasSelection = selectedFacts.size > 0 || selectedFeelings.size > 0 || notes.trim().length > 0

  function toggleFact(chip: string) {
    setSelectedFacts((prev) => {
      const next = new Set(prev)
      next.has(chip) ? next.delete(chip) : next.add(chip)
      return next
    })
  }

  function toggleFeeling(chip: string) {
    setSelectedFeelings((prev) => {
      const next = new Set(prev)
      next.has(chip) ? next.delete(chip) : next.add(chip)
      return next
    })
  }

  async function generate() {
    setLoading(true)
    setErr(null)
    try {
      const res = await fetch('/api/review/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          selectedFacts: Array.from(selectedFacts),
          selectedFeelings: Array.from(selectedFeelings),
          customNotes: notes.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setErr((json as { error?: string }).error ?? 'Could not generate. Please try again.')
        return
      }
      const json = await res.json()
      setDraft(json.draft)
      // Best-effort tracking
      fetch('/api/review/draft/track-copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, event: 'draft_generated' }),
      }).catch(() => { /* best-effort */ })
    } catch {
      setErr('Network error.')
    } finally {
      setLoading(false)
    }
  }

  async function copy() {
    if (!draft) return
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
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Hi {firstName} 👋</h1>
      <p style={{ color: '#6b7280', lineHeight: 1.6, marginTop: 0, marginBottom: 28 }}>
        Thanks for visiting V-Health Rehab Clinic.
      </p>

      {dynamicChips.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', color: '#9ca3af', letterSpacing: '0.05em', marginBottom: 10 }}>
            Your visit
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {dynamicChips.map((chip) => (
              <button
                key={chip}
                onClick={() => toggleFact(chip)}
                style={{
                  padding: '7px 14px',
                  borderRadius: 20,
                  border: selectedFacts.has(chip) ? '2px solid #2563eb' : '1px solid #d1d5db',
                  background: selectedFacts.has(chip) ? '#eff6ff' : '#ffffff',
                  color: selectedFacts.has(chip) ? '#1d4ed8' : '#374151',
                  fontSize: 14,
                  fontWeight: selectedFacts.has(chip) ? 600 : 400,
                  cursor: 'pointer',
                }}
              >
                {chip}
              </button>
            ))}
          </div>
        </section>
      )}

      <section style={{ marginBottom: 24 }}>
        <p style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', color: '#9ca3af', letterSpacing: '0.05em', marginBottom: 10 }}>
          How you felt
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {STATIC_FEELINGS.map((chip) => (
            <button
              key={chip}
              onClick={() => toggleFeeling(chip)}
              style={{
                padding: '7px 14px',
                borderRadius: 20,
                border: selectedFeelings.has(chip) ? '2px solid #2563eb' : '1px solid #d1d5db',
                background: selectedFeelings.has(chip) ? '#eff6ff' : '#ffffff',
                color: selectedFeelings.has(chip) ? '#1d4ed8' : '#374151',
                fontSize: 14,
                fontWeight: selectedFeelings.has(chip) ? 600 : 400,
                cursor: 'pointer',
              }}
            >
              {chip}
            </button>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 24 }}>
        <p style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', color: '#9ca3af', letterSpacing: '0.05em', marginBottom: 10 }}>
          Your own words (optional)
        </p>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="Anything else? Just a few words..."
          style={{ width: '100%', padding: 10, fontSize: 15, border: '1px solid #e5e7eb', borderRadius: 8, boxSizing: 'border-box', resize: 'vertical' }}
        />
      </section>

      <button
        onClick={generate}
        disabled={loading || !hasSelection}
        style={{
          background: hasSelection ? '#16a34a' : '#9ca3af',
          color: '#fff',
          padding: '13px 26px',
          border: 'none',
          borderRadius: 8,
          fontSize: 16,
          fontWeight: 600,
          cursor: hasSelection ? 'pointer' : 'not-allowed',
          opacity: loading ? 0.7 : 1,
          width: '100%',
        }}
      >
        {loading ? 'Generating…' : 'Generate review'}
      </button>
      {!hasSelection && (
        <p style={{ marginTop: 8, fontSize: 13, color: '#6b7280', textAlign: 'center' }}>
          Pick at least one word to complete
        </p>
      )}

      {err && <p role="alert" style={{ color: '#dc2626', marginTop: 10, fontSize: 14 }}>{err}</p>}

      {draft && (
        <div style={{ marginTop: 24 }}>
          <div style={{ background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, whiteSpace: 'pre-wrap', lineHeight: 1.7, fontSize: 15 }}>
            {draft}
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              onClick={copy}
              disabled={loading}
              style={{ background: '#16a34a', color: '#fff', padding: '12px 22px', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 600, cursor: 'pointer', opacity: loading ? 0.6 : 1 }}
            >
              {copied ? 'Copied!' : 'Copy & open Google Maps'}
            </button>
            <button
              onClick={generate}
              disabled={loading}
              style={{ background: '#f3f4f6', color: '#1a1a1a', padding: '12px 18px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 15, cursor: 'pointer', opacity: loading ? 0.6 : 1 }}
            >
              {loading ? 'Regenerating…' : 'Regenerate'}
            </button>
          </div>
        </div>
      )}

      <p style={{ marginTop: 28, color: '#6b7280', fontSize: 13 }}>
        Don&apos;t forget: code <strong>JG</strong> = 10% off your next visit.
      </p>
    </main>
  )
}
