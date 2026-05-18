'use client'
// apps/web/app/(clinic)/dashboard/review-funnel/ReviewFunnelClient.tsx

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { deriveFunnelStage, firstEventAt, aggregateFunnel } from './funnel-logic'
import type { ReviewRow, FunnelStage } from './funnel-logic'

// ─── API-response type ────────────────────────────────────────────────────────
// The GET /api/admin/review-requests response includes additional fields beyond
// the pure ReviewRow type used in funnel-logic. Define them explicitly here so
// we avoid unsafe casts inside the render loop.
// (Generated Supabase types are pending migration 016/017 — same pattern as the
// review-requests page which uses `any` cast on the admin client.)

interface FunnelRow extends ReviewRow {
  patient_name: string
  patient_email: string | null
  patient_phone: string | null
  therapist_name: string | null
  service_type: string
  channel: 'email' | 'sms' | 'both'
  created_at: string
  verified_at: string | null
}

// ─── Stage badge styling ──────────────────────────────────────────────────────

const STAGE_VARIANT: Record<FunnelStage, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  queued: 'outline',
  sent: 'secondary',
  opened: 'secondary',
  clicked: 'default',
  copied: 'default',
  posted: 'default',
  failed: 'destructive',
}

const STAGE_LABEL: Record<FunnelStage, string> = {
  queued: 'Queued',
  sent: 'Sent',
  opened: 'Opened',
  clicked: 'Clicked',
  copied: 'Copied',
  posted: 'Posted',
  failed: 'Failed',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return (
    d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', hour12: false })
  )
}

function pct(numerator: number, denominator: number): string {
  if (denominator === 0) return '—'
  return Math.round((numerator / denominator) * 100) + '%'
}

// ─── Summary card ─────────────────────────────────────────────────────────────

function FunnelSummary({ rows }: { rows: FunnelRow[] }) {
  const agg = aggregateFunnel(rows)
  const steps = [
    { label: 'Sent', count: agg.sent, base: agg.sent },
    { label: 'Opened', count: agg.opened, base: agg.sent },
    { label: 'Clicked', count: agg.clicked, base: agg.sent },
    { label: 'Copied', count: agg.copied, base: agg.sent },
    { label: 'Posted', count: agg.posted, base: agg.sent },
  ]

  return (
    <div className="mb-6 rounded-xl border bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        Conversion funnel — {agg.total} total requests
      </h2>
      <div className="flex flex-wrap gap-4">
        {steps.map((step) => (
          <div key={step.label} className="flex flex-col items-center gap-0.5 min-w-[72px]">
            <span className="text-xl font-bold tabular-nums">{step.count}</span>
            <span className="text-xs text-muted-foreground">{step.label}</span>
            <span className="text-xs font-medium text-primary">{pct(step.count, step.base)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ReviewFunnelClient() {
  const [rows, setRows] = useState<FunnelRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/admin/review-requests')
        if (!res.ok) {
          setError(`Failed to load: ${res.status}`)
          return
        }
        const j = (await res.json()) as { requests?: FunnelRow[] }
        setRows(j.requests ?? [])
      } catch (e) {
        setError(String(e))
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  if (loading) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="mb-6 text-2xl font-semibold">Review funnel</h1>
        <div className="py-16 text-center text-muted-foreground" data-testid="loading">
          Loading funnel data...
        </div>
      </main>
    )
  }

  if (error) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="mb-6 text-2xl font-semibold">Review funnel</h1>
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Review funnel</h1>

      <FunnelSummary rows={rows} />

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="px-3 py-3 text-left font-semibold">Patient</th>
              <th className="px-3 py-3 text-left font-semibold">Sent at</th>
              <th className="px-3 py-3 text-left font-semibold">Email opened</th>
              <th className="px-3 py-3 text-left font-semibold">Link clicked</th>
              <th className="px-3 py-3 text-left font-semibold">Review copied</th>
              <th className="px-3 py-3 text-left font-semibold">Review posted</th>
              <th className="px-3 py-3 text-left font-semibold">Stage</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-12 text-center text-muted-foreground"
                  data-testid="empty-state"
                >
                  No review requests yet. Send one from the Review Requests page.
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const stage = deriveFunnelStage(row)
              const sentAt =
                firstEventAt(row.events, 'sent') ?? (row.status === 'sent' ? row.created_at : null)
              const openedAt = firstEventAt(row.events, 'email_opened')
              const clickedAt = firstEventAt(row.events, 'link_clicked')
              const copiedAt = firstEventAt(row.events, 'review_copied')
              const postedAt = firstEventAt(row.events, 'review_posted')

              return (
                <tr key={row.id} className="border-t hover:bg-muted/20 transition-colors">
                  <td className="px-3 py-3 font-medium">{row.patient_name}</td>
                  <td className="px-3 py-3 text-xs tabular-nums text-muted-foreground">
                    {fmt(sentAt) || <span className="text-muted-foreground/40">—</span>}
                  </td>
                  <td className="px-3 py-3 text-xs tabular-nums">
                    {openedAt ? (
                      <span className="text-foreground">{fmt(openedAt)}</span>
                    ) : (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-xs tabular-nums">
                    {clickedAt ? (
                      <span className="text-foreground">{fmt(clickedAt)}</span>
                    ) : (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-xs tabular-nums">
                    {copiedAt ? (
                      <span className="text-foreground">{fmt(copiedAt)}</span>
                    ) : (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-xs tabular-nums">
                    {postedAt ? (
                      <span className="text-foreground">{fmt(postedAt)}</span>
                    ) : (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <Badge variant={STAGE_VARIANT[stage]}>{STAGE_LABEL[stage]}</Badge>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </main>
  )
}
