-- 017_review_funnel_events.sql
-- S2 Review Engine: append-only funnel event log.

CREATE TABLE public.review_funnel_events (
  id          bigserial PRIMARY KEY,
  request_id  uuid NOT NULL REFERENCES public.review_requests(id) ON DELETE CASCADE,
  event_type  text NOT NULL CHECK (event_type IN (
    'queued',
    'sent_email',
    'sent_sms',
    'email_delivered',
    'email_opened',
    'link_clicked',
    'keywords_submitted',
    'draft_generated',
    'copy_clicked',
    'maps_redirected',
    'send_failed'
  )),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata    jsonb
);

CREATE INDEX review_funnel_events_request_idx
  ON public.review_funnel_events (request_id, occurred_at);

CREATE INDEX review_funnel_events_type_time_idx
  ON public.review_funnel_events (event_type, occurred_at DESC);

ALTER TABLE public.review_funnel_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY review_funnel_events_deny_anon ON public.review_funnel_events
  FOR ALL TO anon USING (false) WITH CHECK (false);
