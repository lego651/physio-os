// apps/web/lib/review/events.ts
import type { SupabaseClient } from '@supabase/supabase-js'

export const IDEMPOTENT_EVENTS = ['link_clicked', 'email_opened'] as const

export type ReviewEventType =
  | 'queued'
  | 'sent_email'
  | 'sent_sms'
  | 'email_delivered'
  | 'email_opened'
  | 'link_clicked'
  | 'keywords_submitted'
  | 'draft_generated'
  | 'copy_clicked'
  | 'maps_redirected'
  | 'send_failed'

export interface LogFunnelEventInput {
  requestId: string
  eventType: ReviewEventType
  metadata?: Record<string, unknown>
}

function isIdempotent(eventType: ReviewEventType): boolean {
  return (IDEMPOTENT_EVENTS as readonly string[]).includes(eventType)
}

export async function logFunnelEvent(
  supabase: SupabaseClient,
  input: LogFunnelEventInput,
): Promise<void> {
  if (isIdempotent(input.eventType)) {
    const { data: existing } = await supabase
      .from('review_funnel_events')
      .select('id')
      .eq('request_id', input.requestId)
      .eq('event_type', input.eventType)
      .maybeSingle()
    if (existing) return
  }
  await supabase.from('review_funnel_events').insert({
    request_id: input.requestId,
    event_type: input.eventType,
    metadata: input.metadata ?? null,
  })
}
