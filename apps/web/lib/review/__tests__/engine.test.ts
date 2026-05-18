import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ReviewRequestEngine } from '../engine'
import type { ReviewRequestEngineDeps } from '../engine'

const clinic = {
  id: 'c1',
  name: 'V-Health Rehab Clinic',
  google_place_id: 'PLACE_ID',
  google_maps_url: 'https://maps/x',
  review_sender_name: 'V-Health',
}

type OptOutRow = { clinic_id: string; contact: string; contact_type: string }
type EventRow = { event_type: string; metadata?: unknown }
type InsertedRow = Record<string, unknown>

function makeDeps(overrides: Partial<ReviewRequestEngineDeps> = {}) {
  const inserted: InsertedRow[] = []
  const events: EventRow[] = []
  const optOuts: OptOutRow[] = []

  // Supabase mock — typed as SupabaseClient via cast since we only implement
  // the subset of methods the engine uses. This is intentional in test code.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = {
    from(table: string) {
      const filter: Record<string, string> = {}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const builder: any = {
        select(_cols?: string) {
          return builder
        },
        eq(col: string, val: string) {
          filter[col] = val
          return builder
        },
        async single() {
          if (table === 'clinics') return { data: clinic, error: null }
          return { data: null, error: null }
        },
        async maybeSingle() {
          if (table === 'review_opt_outs') {
            return {
              data:
                optOuts.find(
                  (r) =>
                    r.clinic_id === filter.clinic_id &&
                    r.contact === filter.contact &&
                    r.contact_type === filter.contact_type,
                ) ?? null,
              error: null,
            }
          }
          if (table === 'review_funnel_events') return { data: null, error: null }
          return { data: null, error: null }
        },
        async insert(row: EventRow) {
          if (table === 'review_funnel_events') {
            events.push(row)
            return { data: row, error: null }
          }
          return { data: row, error: null }
        },
      }
      // Special insert-then-select-then-single chain for review_requests,
      // plus an update chain (used by engine to set final status).
      if (table === 'review_requests') {
        return {
          insert(row: InsertedRow) {
            inserted.push(row)
            return {
              select: () => ({
                single: async () => ({ data: { ...row, id: 'req-1' }, error: null }),
              }),
            }
          },
          update(_patch: Record<string, unknown>) {
            return {
              eq: (_col: string, _val: string) => Promise.resolve({ error: null }),
            }
          },
        }
      }
      return builder
    },
  }

  const email = { send: vi.fn().mockResolvedValue({ providerMessageId: 'em-1' }) }
  const sms = { send: vi.fn().mockResolvedValue({ providerMessageId: 'sm-1' }) }

  return {
    deps: {
      supabase: supabase as ReviewRequestEngineDeps['supabase'],
      email,
      sms,
      config: {
        tokenSecret: 'a'.repeat(64),
        baseUrl: 'https://x',
        testMode: false,
        testRecipientEmail: 'jason@test',
        testRecipientPhone: '+14030000001',
        resendWebhookSecret: '',
      },
      ...overrides,
    } satisfies ReviewRequestEngineDeps,
    inserted,
    events,
    optOuts,
    email,
    sms,
  }
}

describe('ReviewRequestEngine.create', () => {
  beforeEach(() => {
    process.env.REVIEW_TOKEN_SECRET = 'a'.repeat(64)
  })

  it('dispatches both channels and logs sent_email + sent_sms', async () => {
    const { deps, events, email, sms } = makeDeps()
    const engine = new ReviewRequestEngine(deps)
    const out = await engine.create({
      clinicId: 'c1',
      patientName: 'Alice',
      patientEmail: 'a@b.com',
      patientPhone: '+14035550100',
      therapistName: 'Jimmy',
      serviceType: 'massage',
      channel: 'both',
      consentConfirmed: true,
    })
    expect(out.token).toBeTruthy()
    expect(email.send).toHaveBeenCalledOnce()
    expect(sms.send).toHaveBeenCalledOnce()
    expect(events.map((e) => e.event_type).sort()).toEqual(['queued', 'sent_email', 'sent_sms'])
  })

  it('test_mode overrides recipient to the configured test address', async () => {
    const { deps, email } = makeDeps()
    deps.config.testMode = true
    const engine = new ReviewRequestEngine(deps)
    await engine.create({
      clinicId: 'c1',
      patientName: 'Alice',
      patientEmail: 'real@patient.com',
      patientPhone: '+14035550100',
      therapistName: null,
      serviceType: 'massage',
      channel: 'email',
      consentConfirmed: true,
    })
    expect(email.send.mock.calls[0][0].to).toBe('jason@test')
  })

  it('skips email channel when patient is opted out, logs send_failed with reason', async () => {
    const { deps, events, optOuts, email } = makeDeps()
    optOuts.push({ clinic_id: 'c1', contact: 'a@b.com', contact_type: 'email' })
    const engine = new ReviewRequestEngine(deps)
    await engine.create({
      clinicId: 'c1',
      patientName: 'Alice',
      patientEmail: 'a@b.com',
      patientPhone: '+14035550100',
      therapistName: null,
      serviceType: 'massage',
      channel: 'email',
      consentConfirmed: true,
    })
    expect(email.send).not.toHaveBeenCalled()
    const failed = events.find((e) => e.event_type === 'send_failed')
    expect(failed).toBeTruthy()
    expect((failed!.metadata as Record<string, unknown>).reason).toBe('opted_out')
  })

  it('refuses to send when consentConfirmed=false', async () => {
    const { deps } = makeDeps()
    const engine = new ReviewRequestEngine(deps)
    await expect(
      engine.create({
        clinicId: 'c1',
        patientName: 'A',
        patientEmail: 'a@b.com',
        patientPhone: '+1',
        therapistName: null,
        serviceType: 'x',
        channel: 'email',
        consentConfirmed: false,
      }),
    ).rejects.toThrow(/consent/i)
  })
})
