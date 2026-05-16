'use client'
// apps/web/app/(clinic)/dashboard/review-requests/AdminReviewRequestsClient.tsx
import { useEffect, useState } from 'react'

interface Clinic { id: string; name: string; slug: string }
interface Therapist { id: string; clinic_id: string; name: string; role: string }

interface Props { clinics: Clinic[]; therapists: Therapist[] }

interface ReviewRequest {
  id: string
  patient_name: string
  patient_email: string | null
  patient_phone: string | null
  channel: 'email'|'sms'|'both'
  status: string
  verified_at: string | null
  created_at: string
  events: { event_type: string; occurred_at: string; metadata: any }[]
}

const FUNNEL_STEPS = [
  ['sent', ['sent_email','sent_sms']],
  ['delivered', ['email_delivered']],
  ['opened', ['email_opened']],
  ['clicked', ['link_clicked']],
  ['keywords', ['keywords_submitted']],
  ['generated', ['draft_generated']],
  ['copied', ['copy_clicked']],
  ['redirected', ['maps_redirected']],
] as const

function hasEvent(events: ReviewRequest['events'], types: readonly string[]) {
  return events.some(e => types.includes(e.event_type))
}

export default function AdminReviewRequestsClient({ clinics, therapists }: Props) {
  const [clinicId, setClinicId] = useState(clinics[0]?.id ?? '')
  const [patientName, setPatientName] = useState('')
  const [patientEmail, setPatientEmail] = useState('')
  const [patientPhone, setPatientPhone] = useState('')
  const [therapistName, setTherapistName] = useState('')
  const [serviceType, setServiceType] = useState('massage')
  const [channel, setChannel] = useState<'email'|'sms'|'both'>('email')
  const [consent, setConsent] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const [rows, setRows] = useState<ReviewRequest[]>([])

  const clinicTherapists = therapists.filter(t => t.clinic_id === clinicId)

  async function loadList() {
    const res = await fetch('/api/admin/review-requests')
    if (res.ok) {
      const json = await res.json()
      setRows(json.requests ?? [])
    }
  }
  useEffect(() => { void loadList() }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true); setFlash(null)
    const body = {
      clinicId, patientName, channel,
      patientEmail: patientEmail || null,
      patientPhone: patientPhone || null,
      therapistName: therapistName || null,
      serviceType,
      consentConfirmed: consent,
    }
    const res = await fetch('/api/admin/review-requests', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      setFlash('Review request sent.')
      setPatientName(''); setPatientEmail(''); setPatientPhone(''); setTherapistName('')
      setConsent(false)
      void loadList()
    } else {
      const j = await res.json().catch(() => ({}))
      setFlash(`Error: ${j.error ?? res.status}`)
    }
    setSubmitting(false)
  }

  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px', fontFamily: '-apple-system,system-ui,sans-serif' }}>
      <h1 style={{ fontSize: 22, marginBottom: 24 }}>Review requests</h1>

      <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, padding: 24, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, marginBottom: 32 }}>
        <label>Clinic
          <select value={clinicId} onChange={e => setClinicId(e.target.value)} style={input}>
            {clinics.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label>Channel
          <select value={channel} onChange={e => setChannel(e.target.value as any)} style={input}>
            <option value="email">Email</option><option value="sms">SMS</option><option value="both">Both</option>
          </select>
        </label>
        <label>Patient name
          <input value={patientName} onChange={e => setPatientName(e.target.value)} required style={input} />
        </label>
        <label>Therapist
          <input list="therapists-list" value={therapistName} onChange={e => setTherapistName(e.target.value)} style={input} />
          <datalist id="therapists-list">
            {clinicTherapists.map(t => <option key={t.id} value={t.name} />)}
          </datalist>
        </label>
        <label>Patient email
          <input type="email" value={patientEmail} onChange={e => setPatientEmail(e.target.value)} style={input} />
        </label>
        <label>Patient phone (E.164, e.g. +14035550100)
          <input value={patientPhone} onChange={e => setPatientPhone(e.target.value)} style={input} />
        </label>
        <label>Service type
          <select value={serviceType} onChange={e => setServiceType(e.target.value)} style={input}>
            <option value="massage">Massage</option><option value="physio">Physio</option>
            <option value="acupuncture">Acupuncture</option><option value="osteopathy">Osteopathy</option>
          </select>
        </label>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />
            <span>I confirm this patient consented to receive follow-up communications.</span>
          </label>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <button type="submit" disabled={submitting || !consent} style={{ background: '#2563eb', color: '#fff', padding: '10px 20px', border: 'none', borderRadius: 8, cursor: 'pointer', opacity: submitting || !consent ? 0.6 : 1 }}>
            {submitting ? 'Sending…' : 'Send review request'}
          </button>
        </div>
        {flash && <p style={{ gridColumn: '1 / -1', color: flash.startsWith('Error') ? '#dc2626' : '#059669' }}>{flash}</p>}
      </form>

      <h2 style={{ fontSize: 18, marginBottom: 12 }}>Recent (last 50)</h2>
      <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead style={{ background: '#f8fafc' }}>
            <tr>
              <th style={th}>When</th><th style={th}>Patient</th><th style={th}>Channel</th>
              {FUNNEL_STEPS.map(([label]) => <th key={label} style={th}>{label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                <td style={td}>{new Date(r.created_at).toLocaleString()}</td>
                <td style={td}>{r.patient_name}</td>
                <td style={td}>{r.channel}</td>
                {FUNNEL_STEPS.map(([label, types]) => (
                  <td key={label} style={td}>{hasEvent(r.events, types) ? '✓' : ''}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  )
}

const input: React.CSSProperties = { display: 'block', width: '100%', marginTop: 6, padding: 8, fontSize: 14, border: '1px solid #e5e7eb', borderRadius: 6 }
const th: React.CSSProperties = { textAlign: 'left', padding: '10px 12px', fontWeight: 600 }
const td: React.CSSProperties = { padding: '10px 12px', verticalAlign: 'top' }
