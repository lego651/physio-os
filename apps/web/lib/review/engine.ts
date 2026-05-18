// apps/web/lib/review/engine.ts
//
// Orchestrates a single review request: clinic load → opt-out check
// → row insert → JWT mint → channel dispatch → event log.
import type { SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { mintReviewToken } from './tokens'
import { logFunnelEvent } from './events'
import { isOptedOut } from './opt-outs'
import { buildReviewEmailHtml, buildReviewEmailSubject } from './templates/email'
import { buildReviewSmsBody } from './templates/sms'
import type { EmailAdapter } from './adapters/email'
import type { SmsAdapter } from './adapters/sms'
import type { ReviewConfig } from './config'

const TOKEN_EXPIRES_IN_DAYS = 14

export interface ReviewRequestEngineDeps {
  supabase: SupabaseClient
  email: Pick<EmailAdapter, 'send'>
  sms: Pick<SmsAdapter, 'send'>
  config: ReviewConfig
}

export interface CreateReviewRequestInput {
  clinicId: string
  patientName: string
  patientEmail: string | null
  patientPhone: string | null
  therapistName: string | null
  serviceType: string
  channel: 'email' | 'sms' | 'both'
  consentConfirmed: boolean
  createdBy?: string
}

export interface CreateReviewRequestResult {
  id: string
  token: string
}

interface ClinicRow {
  id: string
  name: string
  google_place_id: string | null
  google_maps_url: string | null
  review_sender_name: string | null
}

export class ReviewRequestEngine {
  constructor(private readonly deps: ReviewRequestEngineDeps) {}

  async create(input: CreateReviewRequestInput): Promise<CreateReviewRequestResult> {
    if (!input.consentConfirmed) {
      throw new Error('Patient consent must be confirmed before sending')
    }

    const clinic = await this.loadClinic(input.clinicId)
    const senderName = clinic.review_sender_name ?? clinic.name

    const wantsEmail = input.channel === 'email' || input.channel === 'both'
    const wantsSms = input.channel === 'sms' || input.channel === 'both'

    const jti = randomUUID()
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRES_IN_DAYS * 86_400_000).toISOString()

    const { data: inserted, error } = await this.deps.supabase
      .from('review_requests')
      .insert({
        clinic_id: input.clinicId,
        patient_name: input.patientName,
        patient_email: input.patientEmail,
        patient_phone: input.patientPhone,
        therapist_name: input.therapistName,
        service_type: input.serviceType,
        channel: input.channel,
        token_jti: jti,
        test_mode: this.deps.config.testMode,
        status: 'queued',
        expires_at: expiresAt,
        created_by: input.createdBy ?? null,
        metadata: { consent_confirmed: true },
      })
      .select()
      .single()

    if (error || !inserted) {
      throw new Error(`Failed to insert review_requests: ${error?.message ?? 'unknown'}`)
    }

    const requestId = (inserted as { id: string }).id
    await logFunnelEvent(this.deps.supabase, { requestId, eventType: 'queued' })

    const token = await mintReviewToken({
      requestId,
      clinicId: input.clinicId,
      jti,
      expiresInDays: TOKEN_EXPIRES_IN_DAYS,
    })
    const shortLink = `${this.deps.config.baseUrl}/review/${token}`
    // SMS link uses the bare request_id (UUID, 36 chars) instead of the
    // ~280-char JWT — keeps the SMS body inside 1-2 segments. The landing
    // page accepts both formats; see app/review/[token]/page.tsx.
    const smsLink = `${this.deps.config.baseUrl}/review/${requestId}`
    const unsubLink = `${this.deps.config.baseUrl}/api/review-requests/unsubscribe?token=${encodeURIComponent(token)}`

    if (wantsEmail) {
      const realEmail = input.patientEmail
      const recipient = this.deps.config.testMode ? this.deps.config.testRecipientEmail : realEmail
      if (!recipient) {
        await logFunnelEvent(this.deps.supabase, {
          requestId,
          eventType: 'send_failed',
          metadata: { channel: 'email', reason: 'no_recipient' },
        })
      } else if (
        realEmail &&
        (await isOptedOut(this.deps.supabase, {
          clinicId: input.clinicId,
          contact: realEmail,
          contactType: 'email',
        }))
      ) {
        await logFunnelEvent(this.deps.supabase, {
          requestId,
          eventType: 'send_failed',
          metadata: { channel: 'email', reason: 'opted_out' },
        })
      } else {
        try {
          const result = await this.deps.email.send({
            to: recipient,
            from: `${senderName} <onboarding@resend.dev>`,
            subject: buildReviewEmailSubject({
              clinicName: clinic.name,
              patientName: input.patientName,
            }),
            html: buildReviewEmailHtml({
              clinicName: clinic.name,
              senderName,
              patientName: input.patientName,
              shortLink,
              unsubscribeLink: unsubLink,
            }),
          })
          await logFunnelEvent(this.deps.supabase, {
            requestId,
            eventType: 'sent_email',
            metadata: { provider_message_id: result.providerMessageId },
          })
        } catch (err) {
          await logFunnelEvent(this.deps.supabase, {
            requestId,
            eventType: 'send_failed',
            metadata: { channel: 'email', reason: 'provider_error', error: String(err) },
          })
        }
      }
    }

    if (wantsSms) {
      const realPhone = input.patientPhone
      const recipient = this.deps.config.testMode ? this.deps.config.testRecipientPhone : realPhone
      if (!recipient) {
        await logFunnelEvent(this.deps.supabase, {
          requestId,
          eventType: 'send_failed',
          metadata: { channel: 'sms', reason: 'no_recipient' },
        })
      } else if (
        realPhone &&
        (await isOptedOut(this.deps.supabase, {
          clinicId: input.clinicId,
          contact: realPhone,
          contactType: 'sms',
        }))
      ) {
        await logFunnelEvent(this.deps.supabase, {
          requestId,
          eventType: 'send_failed',
          metadata: { channel: 'sms', reason: 'opted_out' },
        })
      } else {
        try {
          const result = await this.deps.sms.send({
            to: recipient,
            body: buildReviewSmsBody({
              senderName,
              patientName: input.patientName,
              shortLink: smsLink,
            }),
          })
          await logFunnelEvent(this.deps.supabase, {
            requestId,
            eventType: 'sent_sms',
            metadata: { provider_message_id: result.providerMessageId },
          })
        } catch (err) {
          await logFunnelEvent(this.deps.supabase, {
            requestId,
            eventType: 'send_failed',
            metadata: { channel: 'sms', reason: 'provider_error', error: String(err) },
          })
        }
      }
    }

    return { id: requestId, token }
  }

  private async loadClinic(clinicId: string): Promise<ClinicRow> {
    const { data, error } = await this.deps.supabase
      .from('clinics')
      .select('id, name, google_place_id, google_maps_url, review_sender_name')
      .eq('id', clinicId)
      .single()
    if (error || !data) throw new Error(`Clinic not found: ${clinicId}`)
    return data as ClinicRow
  }
}
