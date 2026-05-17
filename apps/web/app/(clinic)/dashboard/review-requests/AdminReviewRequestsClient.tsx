'use client'
// apps/web/app/(clinic)/dashboard/review-requests/AdminReviewRequestsClient.tsx

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Clinic { id: string; name: string; slug: string }
interface Therapist { id: string; clinic_id: string; name: string; role: string }
interface OptOut { clinic_id: string; contact: string; contact_type: 'email' | 'sms' }

interface ReviewRequest {
  id: string
  patient_name: string
  patient_email: string | null
  patient_phone: string | null
  therapist_name: string | null
  service_type: string
  channel: 'email' | 'sms' | 'both'
  status: string
  verified_at: string | null
  created_at: string
  events: { event_type: string; occurred_at: string; metadata: unknown }[]
}

interface DraftRow {
  patient_name: string
  patient_phone: string
  patient_email: string
  therapist_name: string
  service_type: string
  channel: 'email' | 'sms' | 'both'
  consent: boolean
}

interface Props {
  clinics: Clinic[]
  therapists: Therapist[]
  optOuts: OptOut[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

type EffectiveChannel = 'email' | 'sms' | 'both' | 'missing'

export function effectiveChannel(
  row: { patient_email: string | null; patient_phone: string | null },
  globalDefault: 'email' | 'sms' | 'both',
): EffectiveChannel {
  const hasEmail = !!row.patient_email
  const hasPhone = !!row.patient_phone
  if (!hasEmail && !hasPhone) return 'missing'
  if (hasEmail && hasPhone) return globalDefault
  if (hasEmail) return 'email'
  return 'sms'
}

export function isRowOptedOut(
  row: { patient_email: string | null; patient_phone: string | null },
  clinicId: string,
  optOuts: OptOut[],
): boolean {
  return optOuts.some(o => {
    if (o.clinic_id !== clinicId) return false
    if (o.contact_type === 'email' && row.patient_email && o.contact === row.patient_email) return true
    if (o.contact_type === 'sms' && row.patient_phone && o.contact === row.patient_phone) return true
    return false
  })
}

function channelBadgeVariant(ch: EffectiveChannel): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (ch === 'missing') return 'destructive'
  if (ch === 'both') return 'default'
  return 'secondary'
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function AdminReviewRequestsClient({ clinics, therapists, optOuts }: Props) {
  const [clinicId, setClinicId] = useState(clinics[0]?.id ?? '')
  const [globalChannel, setGlobalChannel] = useState<'email' | 'sms' | 'both'>('email')
  const [rows, setRows] = useState<ReviewRequest[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [consentMap, setConsentMap] = useState<Record<string, boolean>>({})
  const [editPhone, setEditPhone] = useState<Record<string, string>>({})
  const [editEmail, setEditEmail] = useState<Record<string, string>>({})
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [bulkProgress, setBulkProgress] = useState<{ sent: number; total: number } | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [showAddRow, setShowAddRow] = useState(false)
  const [draft, setDraft] = useState<DraftRow>({
    patient_name: '', patient_phone: '', patient_email: '',
    therapist_name: '', service_type: 'massage', channel: 'email', consent: false,
  })
  const [addingRow, setAddingRow] = useState(false)

  const clinicTherapists = therapists.filter(t => t.clinic_id === clinicId)

  const loadRows = useCallback(async () => {
    const res = await fetch('/api/admin/review-requests')
    if (res.ok) {
      const j = await res.json() as { requests?: ReviewRequest[] }
      setRows(j.requests ?? [])
    }
  }, [])

  useEffect(() => { void loadRows() }, [loadRows])

  function toggleConsent(id: string) {
    setConsentMap(prev => ({ ...prev, [id]: !prev[id] }))
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    const sendable = rows.filter(r => {
      const ch = effectiveChannel(r, globalChannel)
      return ch !== 'missing' && !isRowOptedOut(r, clinicId, optOuts)
    })
    if (selectedIds.size === sendable.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(sendable.map(r => r.id)))
    }
  }

  function showFlash(msg: string) {
    setFlash(msg)
    setTimeout(() => setFlash(null), 4000)
  }

  async function sendRow(row: ReviewRequest) {
    const ch = effectiveChannel(row, globalChannel)
    if (ch === 'missing') { showFlash(`${row.patient_name}: no contact info`); return }
    if (isRowOptedOut(row, clinicId, optOuts)) { showFlash(`${row.patient_name}: opted out`); return }
    if (!consentMap[row.id]) { showFlash('Check the consent box first'); return }

    const phone = editPhone[row.id] ?? row.patient_phone
    const email = editEmail[row.id] ?? row.patient_email

    setSendingId(row.id)
    try {
      const res = await fetch('/api/admin/review-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinicId,
          patientName: row.patient_name,
          patientPhone: (ch === 'sms' || ch === 'both') ? phone : null,
          patientEmail: (ch === 'email' || ch === 'both') ? email : null,
          therapistName: row.therapist_name,
          serviceType: row.service_type ?? 'massage',
          channel: ch,
          consentConfirmed: true,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: unknown }
        showFlash(`Error: ${j.error ?? res.status}`)
      } else {
        showFlash(`Sent to ${row.patient_name}`)
        void loadRows()
      }
    } finally {
      setSendingId(null)
    }
  }

  async function bulkSend() {
    const selected = rows.filter(r => selectedIds.has(r.id))
    const sendable = selected.filter(r => {
      const ch = effectiveChannel(r, globalChannel)
      return ch !== 'missing' && !isRowOptedOut(r, clinicId, optOuts) && consentMap[r.id]
    })

    if (sendable.length === 0) { showFlash('No rows ready to send (check consent checkboxes)'); return }
    if (sendable.length > 10) { showFlash('Max 10 at a time. Deselect some rows.'); return }

    setBulkProgress({ sent: 0, total: sendable.length })
    for (let i = 0; i < sendable.length; i++) {
      const row = sendable[i]
      const ch = effectiveChannel(row, globalChannel)
      const phone = editPhone[row.id] ?? row.patient_phone
      const email = editEmail[row.id] ?? row.patient_email
      try {
        await fetch('/api/admin/review-requests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clinicId,
            patientName: row.patient_name,
            patientPhone: (ch === 'sms' || ch === 'both') ? phone : null,
            patientEmail: (ch === 'email' || ch === 'both') ? email : null,
            therapistName: row.therapist_name,
            serviceType: row.service_type ?? 'massage',
            channel: ch,
            consentConfirmed: true,
          }),
        })
      } catch (_) {
        // continue on individual failure — best effort
      }
      setBulkProgress({ sent: i + 1, total: sendable.length })
    }
    setBulkProgress(null)
    setSelectedIds(new Set())
    showFlash('Bulk send complete')
    void loadRows()
  }

  async function addDraftRow() {
    if (!draft.patient_name.trim()) return
    if (!draft.consent) { showFlash('Consent required'); return }
    setAddingRow(true)
    try {
      const res = await fetch('/api/admin/review-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinicId,
          patientName: draft.patient_name.trim(),
          patientPhone: draft.patient_phone || null,
          patientEmail: draft.patient_email || null,
          therapistName: draft.therapist_name || null,
          serviceType: draft.service_type,
          channel: draft.channel,
          consentConfirmed: true,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: unknown }
        showFlash(`Error: ${j.error ?? res.status}`)
      } else {
        showFlash('Row added and sent')
        setShowAddRow(false)
        setDraft({ patient_name: '', patient_phone: '', patient_email: '', therapist_name: '', service_type: 'massage', channel: 'email', consent: false })
        void loadRows()
      }
    } finally {
      setAddingRow(false)
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  const selectedConsented = rows.filter(r =>
    selectedIds.has(r.id) &&
    consentMap[r.id] &&
    effectiveChannel(r, globalChannel) !== 'missing' &&
    !isRowOptedOut(r, clinicId, optOuts)
  ).length

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Review requests</h1>

      {/* Global settings */}
      <div className="mb-6 flex flex-wrap items-center gap-4 rounded-xl border bg-card p-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Clinic</span>
          <Select value={clinicId} onValueChange={(value) => { if (value) setClinicId(String(value)) }}>
            <SelectTrigger className="h-9 w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {clinics.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Default channel</span>
          <Select value={globalChannel} onValueChange={(v) => { if (v) setGlobalChannel(v as typeof globalChannel) }}>
            <SelectTrigger className="h-9 w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="sms">SMS</SelectItem>
              <SelectItem value="both">Both</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto h-9"
          onClick={() => setShowAddRow(v => !v)}
        >
          {showAddRow ? 'Cancel' : '+ Add row'}
        </Button>
      </div>

      {/* Add row inline form */}
      {showAddRow && (
        <div className="mb-4 rounded-xl border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold">New review request</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Patient name *</label>
              <Input
                value={draft.patient_name}
                onChange={e => setDraft(d => ({ ...d, patient_name: e.target.value }))}
                className="h-9"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Phone</label>
              <Input
                value={draft.patient_phone}
                onChange={e => setDraft(d => ({ ...d, patient_phone: e.target.value }))}
                placeholder="+14035550100"
                className="h-9"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Email</label>
              <Input
                type="email"
                value={draft.patient_email}
                onChange={e => setDraft(d => ({ ...d, patient_email: e.target.value }))}
                className="h-9"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Therapist</label>
              <Input
                list="draft-therapists"
                value={draft.therapist_name}
                onChange={e => setDraft(d => ({ ...d, therapist_name: e.target.value }))}
                className="h-9"
              />
              <datalist id="draft-therapists">
                {clinicTherapists.map(t => <option key={t.id} value={t.name} />)}
              </datalist>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Channel</label>
              <Select
                value={draft.channel}
                onValueChange={(v) => { if (v) setDraft(d => ({ ...d, channel: v as typeof draft.channel })) }}
              >
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="both">Both</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <input
              type="checkbox"
              id="draft-consent"
              checked={draft.consent}
              onChange={e => setDraft(d => ({ ...d, consent: e.target.checked }))}
            />
            <label htmlFor="draft-consent" className="text-xs">
              Patient consented to receive follow-up communications
            </label>
          </div>
          <Button
            onClick={addDraftRow}
            disabled={addingRow || !draft.consent || !draft.patient_name.trim()}
            className="mt-3 h-9"
          >
            {addingRow ? 'Sending...' : 'Add & send'}
          </Button>
        </div>
      )}

      {flash && (
        <div className={`mb-4 rounded-md border px-3 py-2 text-sm ${
          flash.startsWith('Error') || flash.startsWith('Max')
            ? 'border-destructive/50 bg-destructive/10 text-destructive'
            : 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700/50 dark:bg-emerald-950/40 dark:text-emerald-200'
        }`}>
          {flash}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="px-3 py-3 text-left">
                <input
                  type="checkbox"
                  onChange={toggleSelectAll}
                  checked={
                    selectedIds.size > 0 &&
                    selectedIds.size === rows.filter(r =>
                      effectiveChannel(r, globalChannel) !== 'missing' &&
                      !isRowOptedOut(r, clinicId, optOuts)
                    ).length
                  }
                  aria-label="Select all"
                />
              </th>
              <th className="px-3 py-3 text-left font-semibold">Patient</th>
              <th className="px-3 py-3 text-left font-semibold">Phone</th>
              <th className="px-3 py-3 text-left font-semibold">Email</th>
              <th className="px-3 py-3 text-left font-semibold">Channel</th>
              <th className="px-3 py-3 text-left font-semibold">Status</th>
              <th className="px-3 py-3 text-left font-semibold">Consent</th>
              <th className="px-3 py-3 text-left font-semibold">Send</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                  No review requests yet. Use "+ Add row" to create one.
                </td>
              </tr>
            )}
            {rows.map(r => {
              const optedOut = isRowOptedOut(r, clinicId, optOuts)
              const ch = effectiveChannel(r, globalChannel)
              const hasConsent = !!consentMap[r.id]
              const canSend = !optedOut && ch !== 'missing' && hasConsent

              return (
                <tr
                  key={r.id}
                  className={`border-t transition-colors ${optedOut ? 'opacity-40' : 'hover:bg-muted/20'}`}
                >
                  <td className="px-3 py-3">
                    {!optedOut && ch !== 'missing' && (
                      <input
                        type="checkbox"
                        checked={selectedIds.has(r.id)}
                        onChange={() => toggleSelect(r.id)}
                        aria-label={`Select ${r.patient_name}`}
                      />
                    )}
                  </td>
                  <td className="px-3 py-3 font-medium">
                    {r.patient_name}
                    {optedOut && (
                      <span className="ml-2 text-xs text-destructive">(opted out)</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <Input
                      value={editPhone[r.id] ?? r.patient_phone ?? ''}
                      onChange={e => setEditPhone(prev => ({ ...prev, [r.id]: e.target.value }))}
                      placeholder="+1..."
                      className="h-8 w-36 text-xs"
                      disabled={optedOut}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <Input
                      type="email"
                      value={editEmail[r.id] ?? r.patient_email ?? ''}
                      onChange={e => setEditEmail(prev => ({ ...prev, [r.id]: e.target.value }))}
                      placeholder="patient@..."
                      className="h-8 w-44 text-xs"
                      disabled={optedOut}
                    />
                  </td>
                  <td className="px-3 py-3">
                    {ch === 'missing' ? (
                      <span
                        className="text-xs text-destructive"
                        title="Add phone or email to enable sending"
                      >
                        Add contact
                      </span>
                    ) : (
                      <Badge variant={channelBadgeVariant(ch)}>{ch}</Badge>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <Badge variant={r.status === 'sent' ? 'default' : 'outline'}>
                      {r.status}
                    </Badge>
                  </td>
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={hasConsent}
                      onChange={() => toggleConsent(r.id)}
                      disabled={optedOut}
                      aria-label="Confirm consent"
                    />
                  </td>
                  <td className="px-3 py-3">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!canSend || sendingId === r.id}
                      onClick={() => sendRow(r)}
                      className="h-8"
                    >
                      {sendingId === r.id ? '...' : 'Send'}
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Bulk send bar */}
      {selectedIds.size > 0 && (
        <div className="mt-4 flex items-center gap-4 rounded-xl border bg-card p-3">
          <span className="text-sm text-muted-foreground">
            {selectedConsented} of {selectedIds.size} selected ready to send
            {selectedConsented > 10 && (
              <span className="ml-2 text-destructive">(max 10)</span>
            )}
          </span>
          {bulkProgress ? (
            <span className="text-sm">{bulkProgress.sent} / {bulkProgress.total} sent...</span>
          ) : (
            <Button size="sm" onClick={bulkSend} disabled={selectedConsented === 0}>
              Bulk send ({selectedConsented})
            </Button>
          )}
        </div>
      )}
    </main>
  )
}
