// apps/web/lib/review/engine.ts
//
// Orchestrates a single review request: clinic load → opt-out check
// → row insert → JWT mint → channel dispatch → event log.
import type { SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { mintReviewToken } from './tokens'
import { logFunnelEvent } from './events'
import { isOptedOut } from './opt-outs'
import { buildReviewEmailHtml, buildReviewEmailText, buildReviewEmailSubject } from './templates/email'
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
    const unsubLink = `${this.deps.config.baseUrl}/api/review-requests/unsubscribe?token=${encodeURIComponent(token)}`

    // Track whether at least one channel successfully dispatched,
    // and whether any channel hit a provider-level error (as opposed to
    // soft-skip reasons like opted_out or no_recipient).
    let anySent = false
    let anyProviderError = false
    const providerErrors: string[] = []

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
            from: `${senderName} <${process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev'}>`,
            subject: buildReviewEmailSubject({
              clinicName: clinic.name,
              patientName: input.patientName,
            }),
            html: buildReviewEmailHtml({
              clinicName: clinic.name,
              senderName,
              patientName: input.patientName,
              gmapLink: `${this.deps.config.baseUrl}/r/gmap?t=${jti}`,
              aiLink: `${this.deps.config.baseUrl}/r/ai?t=${jti}`,
              unsubscribeLink: unsubLink,
            }),
            text: buildReviewEmailText({
              clinicName: clinic.name,
              senderName,
              patientName: input.patientName,
              gmapLink: `${this.deps.config.baseUrl}/r/gmap?t=${jti}`,
              aiLink: `${this.deps.config.baseUrl}/r/ai?t=${jti}`,
              unsubscribeLink: unsubLink,
            }),
          })
          await logFunnelEvent(this.deps.supabase, {
            requestId,
            eventType: 'sent_email',
            metadata: { provider_message_id: result.providerMessageId },
          })
          anySent = true
        } catch (err) {
          anyProviderError = true
          providerErrors.push(`email: ${String(err)}`)
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
              firstName: input.patientName.split(/\s+/)[0] ?? 'there',
              gmapLink: `${this.deps.config.baseUrl}/r/gmap?t=${jti}`,
              aiLink:   `${this.deps.config.baseUrl}/r/ai?t=${jti}`,
            }),
          })
          await logFunnelEvent(this.deps.supabase, {
            requestId,
            eventType: 'sent_sms',
            metadata: { provider_message_id: result.providerMessageId },
          })
          anySent = true
        } catch (err) {
          anyProviderError = true
          providerErrors.push(`sms: ${String(err)}`)
          await logFunnelEvent(this.deps.supabase, {
            requestId,
            eventType: 'send_failed',
            metadata: { channel: 'sms', reason: 'provider_error', error: String(err) },
          })
        }
      }
    }

    // Update status from 'queued' to 'sent' or 'failed' based on dispatch outcome.
    const finalStatus = anySent ? 'sent' : 'failed'
    await this.deps.supabase
      .from('review_requests')
      .update({ status: finalStatus })
      .eq('id', requestId)

    // Only throw when a provider actually failed — soft skips (opted_out,
    // no_recipient) are expected states that the caller should not treat as errors.
    if (!anySent && anyProviderError) {
      throw new Error(`Send failed: ${providerErrors.join('; ')}`)
    }

    return { id: requestId, token }
  }

  /**
   * Resend a review request that already exists in the DB.
   * Mints a fresh token (new jti + expiry), resets status to 'queued',
   * dispatches via the stored channel, then updates status to 'sent'/'failed'.
   * Does NOT create a new row — the existing row id is preserved.
   */
  async resend(requestId: string): Promise<CreateReviewRequestResult> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = this.deps.supabase as any
    const { data: existing, error: fetchErr } = await supabase
      .from('review_requests')
      .select(
        'id, clinic_id, patient_name, patient_email, patient_phone, therapist_name, service_type, channel, test_mode',
      )
      .eq('id', requestId)
      .single()
    if (fetchErr || !existing) {
      throw new Error(`review_request not found: ${requestId}`)
    }

    const jti = randomUUID()
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRES_IN_DAYS * 86_400_000).toISOString()

    // Reset token + expiry + status back to queued so the new token is valid.
    const { error: resetErr } = await supabase
      .from('review_requests')
      .update({ token_jti: jti, expires_at: expiresAt, status: 'queued', failure_reason: null })
      .eq('id', requestId)
    if (resetErr) throw new Error(`Failed to reset review_request: ${resetErr.message}`)

    await logFunnelEvent(this.deps.supabase, { requestId, eventType: 'queued' })

    const clinic = await this.loadClinic(existing.clinic_id as string)
    const senderName = clinic.review_sender_name ?? clinic.name

    const token = await mintReviewToken({
      requestId,
      clinicId: existing.clinic_id as string,
      jti,
      expiresInDays: TOKEN_EXPIRES_IN_DAYS,
    })
    const shortLink = `${this.deps.config.baseUrl}/review/${token}`
    const unsubLink = `${this.deps.config.baseUrl}/api/review-requests/unsubscribe?token=${encodeURIComponent(token)}`

    const channel = existing.channel as 'email' | 'sms' | 'both'
    const wantsEmail = channel === 'email' || channel === 'both'
    const wantsSms = channel === 'sms' || channel === 'both'
    let anySent = false
    let anyProviderError = false
    const providerErrors: string[] = []

    if (wantsEmail) {
      const realEmail = existing.patient_email as string | null
      const recipient = this.deps.config.testMode ? this.deps.config.testRecipientEmail : realEmail
      if (recipient) {
        try {
          const patientName = existing.patient_name as string
          const result = await this.deps.email.send({
            to: recipient,
            from: `${senderName} <${process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev'}>`,
            subject: buildReviewEmailSubject({
              clinicName: clinic.name,
              patientName,
            }),
            html: buildReviewEmailHtml({
              clinicName: clinic.name,
              senderName,
              patientName,
              gmapLink: `${this.deps.config.baseUrl}/r/gmap?t=${jti}`,
              aiLink: `${this.deps.config.baseUrl}/r/ai?t=${jti}`,
              unsubscribeLink: unsubLink,
            }),
            text: buildReviewEmailText({
              clinicName: clinic.name,
              senderName,
              patientName,
              gmapLink: `${this.deps.config.baseUrl}/r/gmap?t=${jti}`,
              aiLink: `${this.deps.config.baseUrl}/r/ai?t=${jti}`,
              unsubscribeLink: unsubLink,
            }),
          })
          await logFunnelEvent(this.deps.supabase, {
            requestId,
            eventType: 'sent_email',
            metadata: { provider_message_id: result.providerMessageId, resend: true },
          })
          anySent = true
        } catch (err) {
          anyProviderError = true
          providerErrors.push(`email: ${String(err)}`)
          await logFunnelEvent(this.deps.supabase, {
            requestId,
            eventType: 'send_failed',
            metadata: { channel: 'email', reason: 'provider_error', error: String(err) },
          })
        }
      } else {
        await logFunnelEvent(this.deps.supabase, {
          requestId,
          eventType: 'send_failed',
          metadata: { channel: 'email', reason: 'no_recipient' },
        })
      }
    }

    if (wantsSms) {
      const realPhone = existing.patient_phone as string | null
      const recipient = this.deps.config.testMode ? this.deps.config.testRecipientPhone : realPhone
      if (recipient) {
        try {
          const result = await this.deps.sms.send({
            to: recipient,
            body: buildReviewSmsBody({
              firstName: (existing.patient_name as string).split(/\s+/)[0] ?? 'there',
              gmapLink: `${this.deps.config.baseUrl}/r/gmap?t=${jti}`,
              aiLink:   `${this.deps.config.baseUrl}/r/ai?t=${jti}`,
            }),
          })
          await logFunnelEvent(this.deps.supabase, {
            requestId,
            eventType: 'sent_sms',
            metadata: { provider_message_id: result.providerMessageId, resend: true },
          })
          anySent = true
        } catch (err) {
          anyProviderError = true
          providerErrors.push(`sms: ${String(err)}`)
          await logFunnelEvent(this.deps.supabase, {
            requestId,
            eventType: 'send_failed',
            metadata: { channel: 'sms', reason: 'provider_error', error: String(err) },
          })
        }
      } else {
        await logFunnelEvent(this.deps.supabase, {
          requestId,
          eventType: 'send_failed',
          metadata: { channel: 'sms', reason: 'no_recipient' },
        })
      }
    }

    const finalStatus = anySent ? 'sent' : 'failed'
    await supabase
      .from('review_requests')
      .update({ status: finalStatus })
      .eq('id', requestId)

    // Only throw when a provider actually failed — soft skips (no_recipient)
    // are expected states that the caller should not treat as errors.
    if (!anySent && anyProviderError) {
      throw new Error(`Send failed: ${providerErrors.join('; ')}`)
    }

    // Special case: if no contact info was available at all, surface that clearly.
    if (!anySent && !anyProviderError) {
      const noEmail = wantsEmail && !(existing.patient_email as string | null)
      const noPhone = wantsSms && !(existing.patient_phone as string | null)
      if (noEmail || noPhone) {
        throw new Error(`Send failed: no contact information available (channel=${channel})`)
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
