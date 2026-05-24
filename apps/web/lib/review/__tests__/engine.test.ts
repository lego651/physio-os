import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
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

// ─── Error-propagation tests (Task A) ────────────────────────────────────────
//
// The engine must THROW when all attempted channels fail, so the route layer
// can return a 5xx and the UI can show a red error toast instead of silently
// claiming success.

describe('ReviewRequestEngine — error propagation', () => {
  beforeEach(() => {
    process.env.REVIEW_TOKEN_SECRET = 'a'.repeat(64)
  })

  // Helper: build deps where the review_requests table mock supports resend().
  // The resend path needs: select().single() to return a row, update().eq() to
  // succeed, insert on review_funnel_events, and adapter.send to throw/succeed.
  function makeResendDeps(overrides: Partial<ReviewRequestEngineDeps> = {}) {
    const events: { event_type: string; metadata?: unknown }[] = []
    const existingRow = {
      id: 'req-1',
      clinic_id: 'c1',
      patient_name: 'Alice',
      patient_email: 'a@b.com',
      patient_phone: '+14035550100',
      therapist_name: null,
      service_type: 'massage',
      channel: 'sms',
      test_mode: false,
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = {
      from(table: string) {
        if (table === 'review_requests') {
          return {
            select(_cols?: string) {
              return {
                eq(_col: string, _val: string) {
                  return {
                    single: async () => ({ data: existingRow, error: null }),
                  }
                },
              }
            },
            update(_patch: Record<string, unknown>) {
              return { eq: () => Promise.resolve({ error: null }) }
            },
          }
        }
        if (table === 'clinics') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const b: any = {
            select: () => b,
            eq: () => b,
            single: async () => ({ data: clinic, error: null }),
          }
          return b
        }
        if (table === 'review_opt_outs') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const b: any = {
            select: () => b,
            eq: () => b,
            maybeSingle: async () => ({ data: null, error: null }),
          }
          return b
        }
        // review_funnel_events
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const b: any = {
          select: () => b,
          eq: () => b,
          insert: async (row: { event_type: string }) => {
            events.push(row)
            return { data: row, error: null }
          },
        }
        return b
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
      events,
      email,
      sms,
      existingRow,
    }
  }

  it('resend() throws when SMS adapter throws', async () => {
    const { deps, sms } = makeResendDeps()
    sms.send.mockRejectedValue(new Error('Twilio 500'))
    const engine = new ReviewRequestEngine(deps)
    await expect(engine.resend('req-1')).rejects.toThrow(/Send failed/i)
  })

  it('resend() throws when email adapter throws', async () => {
    const { deps, email, existingRow } = makeResendDeps()
    // Override existing row to use email channel
    Object.assign(existingRow, { channel: 'email' })
    email.send.mockRejectedValue(new Error('Resend 500'))
    const engine = new ReviewRequestEngine(deps)
    await expect(engine.resend('req-1')).rejects.toThrow(/Send failed/i)
  })

  it('resend() throws with no-contact message when row has no phone and no email', async () => {
    const { deps, existingRow } = makeResendDeps()
    Object.assign(existingRow, { patient_phone: null, patient_email: null, channel: 'sms' })
    const engine = new ReviewRequestEngine(deps)
    await expect(engine.resend('req-1')).rejects.toThrow(/no contact/i)
  })

  it('create() throws when SMS adapter throws (single-channel sms)', async () => {
    const { deps, sms } = makeDeps()
    sms.send.mockRejectedValue(new Error('Twilio 429'))
    const engine = new ReviewRequestEngine(deps)
    await expect(
      engine.create({
        clinicId: 'c1',
        patientName: 'Alice',
        patientEmail: null,
        patientPhone: '+14035550100',
        therapistName: null,
        serviceType: 'massage',
        channel: 'sms',
        consentConfirmed: true,
      }),
    ).rejects.toThrow(/Send failed/i)
  })

  it('create() does NOT throw when one of two "both" channels succeeds', async () => {
    const { deps, sms } = makeDeps()
    sms.send.mockRejectedValue(new Error('Twilio down'))
    // email.send still succeeds (default mock)
    const engine = new ReviewRequestEngine(deps)
    // should resolve (anySent=true because email succeeded)
    await expect(
      engine.create({
        clinicId: 'c1',
        patientName: 'Alice',
        patientEmail: 'a@b.com',
        patientPhone: '+14035550100',
        therapistName: null,
        serviceType: 'massage',
        channel: 'both',
        consentConfirmed: true,
      }),
    ).resolves.toBeTruthy()
  })
})

// ─── Original tests ───────────────────────────────────────────────────────────

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

describe('ReviewRequestEngine.create — email sender env var', () => {
  beforeEach(() => {
    process.env.REVIEW_TOKEN_SECRET = 'a'.repeat(64)
  })

  afterEach(() => {
    delete process.env.RESEND_FROM_EMAIL
  })

  it('uses RESEND_FROM_EMAIL env var as the from address when set', async () => {
    process.env.RESEND_FROM_EMAIL = 'noreply@myclinic.com'
    const { deps, email } = makeDeps()
    const engine = new ReviewRequestEngine(deps)
    await engine.create({
      clinicId: 'c1',
      patientName: 'Alice',
      patientEmail: 'alice@test.com',
      patientPhone: null,
      therapistName: null,
      serviceType: 'massage',
      channel: 'email',
      consentConfirmed: true,
    })
    expect(email.send).toHaveBeenCalledOnce()
    expect(email.send.mock.calls[0][0].from).toContain('noreply@myclinic.com')
  })

  it('falls back to onboarding@resend.dev when RESEND_FROM_EMAIL is not set', async () => {
    delete process.env.RESEND_FROM_EMAIL
    const { deps, email } = makeDeps()
    const engine = new ReviewRequestEngine(deps)
    await engine.create({
      clinicId: 'c1',
      patientName: 'Alice',
      patientEmail: 'alice@test.com',
      patientPhone: null,
      therapistName: null,
      serviceType: 'massage',
      channel: 'email',
      consentConfirmed: true,
    })
    expect(email.send).toHaveBeenCalledOnce()
    expect(email.send.mock.calls[0][0].from).toContain('onboarding@resend.dev')
  })
})
