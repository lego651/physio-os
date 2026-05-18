# S2 — Post-Visit Google Review Trigger Engine

**Spec status:** Draft for review
**Date:** 2026-05-16
**Owner:** physio-david (agent)
**Phase 1 scope lock:** Single feature. S1, S3–S7 are Phase 2+ backlog. See `docs/roadmap.md`.

---

## 1. Purpose

V-Health already has an in-clinic Google Maps review QR code at the front desk. That channel produces reviews but the source is opaque — there is no way to tell whether a review came from the QR card, a returning patient, or organic search. Phase 1 needs **a measurable funnel**.

S2 builds a post-visit email + SMS pipeline that:

1. The clinic owner triggers from an admin page after a treatment session.
2. The patient receives a personalised message with a short link.
3. The short link opens a one-page web form. The patient types 2–3 keywords. Claude Haiku 4.5 generates a natural first-person Google review draft. The patient copies the draft and is deep-linked to the V-Health Google Maps review page where they paste and submit on Google's side (Google has no third-party post API; this is documented and accepted, not a limitation to engineer around).
4. Every step of the funnel — **sent, delivered, opened, clicked, keywords-submitted, draft-generated, copy-clicked, maps-redirected** — is persisted as an event row in Supabase. The admin page reads these events to show conversion at each step.

The product is multi-tenant from day 1 because the north star is to productize the playbook and sell to clinic #2+ (see `docs/motivation.md`). V-Health is the first `clinics` row.

---

## 2. Non-goals

- **No automatic posting to Google Maps.** Google offers no third-party review-submission API. The patient pastes the draft into the Google review form themselves. Documented as a fixed constraint.
- **No photo upload in Phase 1.0.** Variant A (keyword → draft) is text-only. Photo handling is a Variant F concern that is deferred.
- **No JaneApp API integration.** Patient identity is entered manually in the admin page until JaneApp data access is negotiated.
- **No alternate AI variants (B/C/D/E/F).** Variant A only. A/B testing of additional variants is a separate spec planned 2–3 weeks after Phase 1.0 launches.
- **No production CA 10DLC short code.** SMS in Phase 1.0 development uses Twilio trial credentials + verified caller IDs. Production SMS rollout to real patients waits on the 10DLC application, but that is a separate ops task, not a code dependency.

---

## 3. Architecture

```
┌─────────────────────┐
│ /admin/review-      │  Auth-gated. Clinic owner enters
│ requests (page.tsx) │  patient name + email + phone +
│                     │  therapist + service. Picks
│                     │  channel: email | sms | both.
└──────────┬──────────┘
           │ POST /api/admin/review-requests
           ▼
┌─────────────────────┐    ┌──────────────────────────────┐
│ ReviewRequestEngine │───▶│ supabase: review_requests    │
│  - mint JWT token   │    │   (one row per send)         │
│  - log "sent_*" evt │    └──────────────────────────────┘
│  - dispatch:        │
│    EmailAdapter     │
│    SmsAdapter       │
└──────────┬──────────┘
           │ Resend / Twilio
           ▼
   Patient receives message with short link:
   https://{domain}/review/{jwt-token}
           │
           ▼
┌─────────────────────┐    ┌──────────────────────────────┐
│ /review/[token]     │───▶│ POST /api/review/track       │
│  page.tsx           │    │   (event: "link_clicked")    │
│  - decode JWT       │    └──────────────────────────────┘
│  - keyword input    │
│  - generate button  │
└──────────┬──────────┘
           │ POST /api/review/generate
           ▼
┌─────────────────────┐    ┌──────────────────────────────┐
│ Claude Haiku 4.5    │    │ supabase: review_funnel_events│
│  Variant A prompt   │───▶│   (one row per funnel step)  │
└──────────┬──────────┘    └──────────────────────────────┘
           │
           ▼
   Draft shown → Copy button → Google Maps deep link
   Each interaction → POST /api/review/track
```

---

## 4. Data model

### 4.1 Reused tables

- `clinics` (already in migration 012). V-Health is row 1 (`slug = 'vhealth'`).
- `therapists` (already in 012). Used to autocomplete therapist names in admin.

**Dependency:** Migration 012 must be applied before S2 ships. It is currently unapplied (per `.david-state.md`). Applying 012–015 is a prerequisite task in the implementation plan.

### 4.2 New tables (migrations 016 + 017)

```sql
-- supabase/migrations/016_review_requests.sql

-- Add Google Business Profile fields to existing clinics table (migration 012).
ALTER TABLE public.clinics
  ADD COLUMN google_place_id    TEXT,                          -- e.g. "ChIJ..."; required for write-review deep link
  ADD COLUMN google_maps_url    TEXT,                          -- canonical maps listing URL (fallback if place_id absent)
  ADD COLUMN review_sender_name TEXT;                          -- display name used as Email "From" and SMS prefix

CREATE TABLE public.review_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_name    TEXT NOT NULL,
  patient_email   TEXT,                          -- nullable: SMS-only requests
  patient_phone   TEXT,                          -- nullable: email-only requests
  therapist_name  TEXT,                          -- denormalised; therapists may churn
  service_type    TEXT,                          -- e.g. "massage", "physio"
  channel         TEXT NOT NULL CHECK (channel IN ('email','sms','both')),
  token_jti       UUID NOT NULL UNIQUE,          -- JWT jti for revocation lookup
  test_mode       BOOLEAN NOT NULL DEFAULT false, -- routed to test inbox/phone
  status          TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed','expired','revoked')),
  failure_reason  TEXT,
  verified_at     TIMESTAMPTZ,                   -- operator-set when a Google review is confirmed traceable to this request
  metadata        JSONB,                          -- e.g. {"consent_confirmed": true} (consent checkbox state logged here)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL,
  created_by      UUID                            -- auth.users(id); FK added if auth schema available
);

CREATE TABLE public.review_opt_outs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  contact       TEXT NOT NULL,                   -- email or phone (E.164)
  contact_type  TEXT NOT NULL CHECK (contact_type IN ('email','sms')),
  opted_out_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  source        TEXT NOT NULL CHECK (source IN ('email_link','sms_keyword','admin')),
  UNIQUE (clinic_id, contact, contact_type)
);

CREATE INDEX review_opt_outs_lookup_idx
  ON public.review_opt_outs (clinic_id, contact, contact_type);

CREATE INDEX review_requests_clinic_created_idx
  ON public.review_requests (clinic_id, created_at DESC);

CREATE INDEX review_requests_status_expires_idx
  ON public.review_requests (status, expires_at);

ALTER TABLE public.review_requests ENABLE ROW LEVEL SECURITY;
-- RLS policy: only service_role and authenticated admin users can read/write
-- (mirrors existing widget tables)
```

```sql
-- supabase/migrations/017_review_funnel_events.sql
CREATE TABLE public.review_funnel_events (
  id          BIGSERIAL PRIMARY KEY,
  request_id  UUID NOT NULL REFERENCES public.review_requests(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL CHECK (event_type IN (
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
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata    JSONB                                  -- e.g. {"resend_message_id":"...", "user_agent":"...", "error":"..."}
);

CREATE INDEX review_funnel_events_request_idx
  ON public.review_funnel_events (request_id, occurred_at);

CREATE INDEX review_funnel_events_type_time_idx
  ON public.review_funnel_events (event_type, occurred_at DESC);

ALTER TABLE public.review_funnel_events ENABLE ROW LEVEL SECURITY;
```

### 4.3 Why an append-only events table

- The funnel will evolve. Today we have 9 event types; in 6 weeks we may have 14 (`opened_2nd_time`, `regenerated_draft`, `disclaimer_dismissed`). Schema churn on a wide `review_requests` columns approach would be painful.
- A patient may copy twice or click the maps link twice. Multi-event-per-request is natural.
- Admin queries are aggregations that Supabase handles cheaply with the two indexes above.

---

## 5. Components

### 5.1 `apps/web/lib/review/tokens.ts`

JWT helpers using existing `jose` library (already used by widget V1).

- `mintReviewToken({ requestId, clinicId, exp }): string`
- `verifyReviewToken(token): { requestId, clinicId, jti }` — throws on expiry, signature mismatch, or revocation.
- Secret: new env var `REVIEW_TOKEN_SECRET` (separate from widget secret for blast-radius isolation).

### 5.2 `apps/web/lib/review/engine.ts` — `ReviewRequestEngine`

Single entry point. Coordinates clinic load, opt-out check, DB insert, token mint, channel dispatch, event logging.

```ts
class ReviewRequestEngine {
  constructor(deps: {
    supabase: SupabaseClient
    email: EmailAdapter
    sms: SmsAdapter
    config: {
      baseUrl: string
      tokenSecret: string
      testMode: boolean
      testRecipientEmail: string
      testRecipientPhone: string
    }
  })

  async create(input: CreateReviewRequestInput): Promise<{ id: string; token: string }>
  // 1. Load clinic by clinic_id (name + google_place_id needed for prompt and deep link).
  // 2. Check review_opt_outs for each channel; skip the channel if opted out.
  // 3. Insert review_requests row + 'queued' event.
  // 4. Mint JWT bound to request id.
  // 5. Dispatch via email/sms adapter(s); log 'sent_email'/'sent_sms' or 'send_failed'.
  // In test_mode, recipient is overridden to config.testRecipient* before adapter call.
  // Everything else (DB rows, events, JWT contents) is identical to production.
}
```

The engine is the only place that decides "where the message goes" so test-mode is a single conditional, not scattered. The engine also passes `clinic.name`, `therapist_name`, and `service_type` to the prompt builder used by `/api/review/generate`.

### 5.3 `apps/web/lib/review/adapters/email.ts`

`EmailAdapter` wraps existing `apps/web/lib/email/` Resend client. Sends a templated email with: greeting, one CTA button, short link, sender identification, unsubscribe footer (CASL — see §7). Returns `{ providerMessageId }`. Resend native open tracking pixel is enabled.

Webhook handler at `/api/webhooks/resend` consumes `email.delivered` and `email.opened` events and writes `review_funnel_events` rows. Resend webhook signing secret is verified.

### 5.4 `apps/web/lib/review/adapters/sms.ts`

`SmsAdapter` wraps existing `apps/web/lib/sms/send.ts`. Sends a short message (≤ 160 chars with CASL footer) containing the short link. Returns `{ providerMessageId }`. Twilio has no native open event; the `link_clicked` event at `/review/[token]` is the proxy.

### 5.5 `apps/web/app/api/review/generate/route.ts`

POST endpoint. Verifies JWT (no DB lookup needed beyond status check). Calls Claude Haiku 4.5 with Variant A prompt:

```
You help a patient write a short Google review for {clinic_name}.
The patient's notes (verbatim): {keywords}
Therapist: {therapist_name}
Service: {service_type}

Write a natural, first-person 3-5 sentence Google review. Mention the
therapist by name if provided. Mention the service type. Sound like a
real patient, not promotional. Do not include any medical claims. Do not
include any contact information.
```

Logs `keywords_submitted` and `draft_generated` events. Returns `{ draft: string }`.

### 5.6 `apps/web/app/review/[token]/page.tsx`

Server component that:

1. Decodes the JWT to get `requestId, clinicId`.
2. Loads the clinic name and Google Maps review URL.
3. Logs `link_clicked` event (first visit only — deduplicated by checking existing event).
4. Renders client component with keyword input, generate button, draft display, copy button, Google Maps deep link.

Copy button uses `navigator.clipboard.writeText` and fires `copy_clicked` event via `/api/review/track`. The Google Maps button fires `maps_redirected` and opens `https://search.google.com/local/writereview?placeid={clinic.google_place_id}` in a new tab.

### 5.7 `apps/web/app/api/review/track/route.ts`

POST endpoint accepting `{ token, event_type, metadata? }`. Verifies JWT. Inserts one `review_funnel_events` row. Idempotency rules (scoped per `request_id`):

- `link_clicked` and `email_opened`: deduplicated. Only the first event of that type per request is stored.
- `copy_clicked`, `maps_redirected`: not deduplicated. Multiple events per request are intentional (a patient may copy twice).
- `keywords_submitted`, `draft_generated`: not deduplicated. Regenerations are signal.

### 5.8 `apps/web/app/api/review/unsubscribe/route.ts`

POST endpoint (no auth required — patient-accessible). Accepts `{ token, jti }` query params. Verifies the JWT to confirm the `clinic_id`. Upserts a row into `review_opt_outs` for the contact (email or phone) extracted from the `review_requests` row matching `token_jti`. Returns a 200 with a plain confirmation page. No redirect. No further sends to that contact will succeed — the engine checks `review_opt_outs` before each dispatch.

This route is referenced in every email footer unsubscribe link. SMS opt-out continues to use the existing STOP keyword path in `apps/web/lib/sms/keywords.ts` — no new code needed for SMS.

### 5.9 `apps/web/app/(clinic)/admin/review-requests/page.tsx`

Auth-gated page (existing auth helpers).

Two sections:

1. **Send form.** Patient name, email, phone, therapist (autocomplete from `therapists`), service type (dropdown), channel (email / sms / both). Submit calls `POST /api/admin/review-requests`.
2. **Recent requests table.** Last 50 rows, with per-row funnel: sent → delivered → opened → clicked → keywords → generated → copied → redirected. Each step shows a checkmark or timestamp. Filterable by channel and date range.

### 5.10 `apps/web/app/api/admin/review-requests/route.ts`

POST handler. Auth check via existing helpers. Validates input (Zod schema). Calls `ReviewRequestEngine.create(...)`. Returns `{ id }` on success.

GET handler returns paginated list with embedded funnel events for the admin table.

---

## 6. Funnel measurement contract

The admin table renders per-request funnel state by joining `review_requests` with `review_funnel_events` and applying a fixed projection:

| Step               | Source                                    | Description                                               |
| ------------------ | ----------------------------------------- | --------------------------------------------------------- |
| sent               | `event_type IN ('sent_email','sent_sms')` | Adapter call returned 200 OK from provider                |
| delivered          | `event_type = 'email_delivered'`          | Resend webhook only (no Twilio delivery event used in v1) |
| opened             | `event_type = 'email_opened'`             | Resend pixel hit. SMS has no equivalent.                  |
| clicked            | `event_type = 'link_clicked'`             | Patient opened `/review/[token]`                          |
| keywords-submitted | `event_type = 'keywords_submitted'`       | First successful POST to `/api/review/generate`           |
| draft-generated    | `event_type = 'draft_generated'`          | Claude returned a non-empty draft                         |
| copy-clicked       | `event_type = 'copy_clicked'`             | Clipboard API succeeded                                   |
| maps-redirected    | `event_type = 'maps_redirected'`          | Google Maps button clicked                                |

The admin UI displays these eight columns. Conversion at each step = `count(events of step N) / count(events of step N-1)`.

`verified_google_review` is **not** an automatable event — it requires manual reconciliation. Operators set the `verified_at` column on `review_requests` (defined in §4.2) once a matching Google review is confirmed traceable. The admin UI exposes a button per row to set this timestamp.

---

## 7. Compliance

### 7.1 CASL (email + SMS)

Reuse the existing CASL checklist passed by S607 (`docs/sms-compliance.md`). Specific applications:

- **First outbound message identifies sender:** "V-Health" prefix on SMS; "From V-Health Rehab Clinic" in email From name.
- **Opt-out mechanism on every send:**
  - SMS footer: `\nReply STOP to unsubscribe.`
  - Email footer: a one-line unsubscribe link that hits `POST /api/review/unsubscribe?token=...&jti=...` and inserts a row in `review_opt_outs` so future sends to the same email/phone short-circuit. The engine checks `review_opt_outs` before each send and aborts (logging `send_failed` with `metadata.reason = 'opted_out'`) if a match exists.
- **Consent before sending:** documented operational requirement. The admin form has a checkbox: "I confirm this patient consented to receive follow-up communications from V-Health." Defaults to unchecked. Submit is blocked until checked. The checkbox state is logged in the `review_requests.metadata`.
- **Audit trail:** every outbound message persisted as a `review_funnel_events` row.

### 7.2 Twilio test mode

For development and Phase 1.0 friend-alpha:

- Twilio trial credentials.
- Verified caller IDs (Jason's phone, Jason's friends' phones).
- Twilio's automatic trial-message prefix is accepted.

For Phase 1.2 production SMS: 10DLC Canadian number application is a separate operational task tracked outside this spec. Email rollout does not block on SMS.

---

## 8. Configuration

New env vars:

```
REVIEW_TOKEN_SECRET=<32-byte hex>         # required, distinct from WIDGET_SESSION_SECRET
REVIEW_BASE_URL=https://...               # required, used for short link assembly
REVIEW_TEST_MODE=true|false               # default false
REVIEW_TEST_RECIPIENT_EMAIL=jason@...     # required when REVIEW_TEST_MODE=true
REVIEW_TEST_RECIPIENT_PHONE=+1...         # required when REVIEW_TEST_MODE=true
RESEND_WEBHOOK_SECRET=<from Resend>       # required for /api/webhooks/resend signature verify
```

Existing env vars reused: `RESEND_API_KEY`, `TWILIO_*`, `ANTHROPIC_API_KEY_WIDGET` (Haiku 4.5 access).

`REVIEW_TEST_MODE=true` causes the engine to override `patient_email` and `patient_phone` to the configured test recipients. Everything else flows identically, including DB writes and event logs.

---

## 9. Test strategy

Three layers.

### 9.1 Unit (Vitest)

- `tokens.ts`: mint and verify roundtrip, expiry handling, signature mismatch.
- Prompt builder: input → expected prompt string snapshot.
- Event logger: idempotency for `link_clicked` and `email_opened`; non-idempotency for `copy_clicked`.
- `ReviewRequestEngine.create`: test_mode overrides recipient; non-test passes patient values through.

No network in unit tests; adapters and Supabase client are mocked.

### 9.2 Integration

- Live Supabase test instance (existing): migrations applied, real inserts, real reads.
- Resend in sandbox mode (Resend supports test API keys that no-op the send).
- Twilio Magic numbers (`+15005550006` etc.) for sandbox SMS calls.
- Webhook signature verification: replay a recorded Resend webhook payload, assert event row written.

### 9.3 E2E (Playwright)

- Hits staging URL.
- `REVIEW_TEST_MODE=true` so the run sends to a test inbox/phone owned by Jason.
- One scripted scenario: admin opens send form, fills patient, submits, asserts `sent_email` and `sent_sms` rows; opens the email pixel URL programmatically, asserts `email_opened`; visits `/review/[token]`, types keywords, clicks generate, copies draft, redirects.
- No real V-Health Google Maps writes ever in CI.

### 9.4 Production smoke

- Stage 0 in §10 below is the manual smoke. Not automated.

---

## 10. Rollout

| Stage                                 | Duration | Recipients                                                                                             | Env                                                                        | Pass criteria                                                   |
| ------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 0 — Internal plumbing                 | 1 day    | Jason only                                                                                             | Staging, `REVIEW_TEST_MODE=true`                                           | E2E green. All 9 event types logged for at least one request.   |
| 1 — Friend alpha                      | 3 days   | Jason + 2–3 friends (consenting)                                                                       | Staging, `REVIEW_TEST_MODE=false` but recipients are friends, not patients | Click rate > 50% on the cohort. Copy rate > 30%. Zero crashes.  |
| 2 — V-Health soft launch (email only) | 14 days  | 5–10 real patients/day                                                                                 | Production, email channel only                                             | First real V-Health Google review traceable through the funnel. |
| 3 — V-Health full (email + SMS)       | 30 days  | All discharged patients post-treatment, **still admin-triggered** (no JaneApp auto-discovery in scope) | Production, both channels                                                  | Day 14 + Day 30 data review with PM + Mathieu.                  |
| 4 — Productize for clinic #2          | TBD      | New clinic onboarded via admin in ≤ 20 minutes                                                         | Production                                                                 | Clinic #2 first send succeeds end-to-end.                       |

Stage 2 starts only after David Wang has signed off on CASL consent for V-Health patients (operational task, not a code dependency). Stage 3 SMS half starts only after the 10DLC Canadian number is provisioned.

---

## 11. Open operational tasks (not in this spec)

- Apply migrations 012–015 before 016/017. They are unapplied per `.david-state.md`.
- Twilio 10DLC CA number application — required before Stage 3 SMS but not before Stage 0–2.
- David Wang written CASL confirmation — required before Stage 2.
- Decide whether to merge `feat/chatbot-widget-v1` to `main` before starting `feat/s2-review-engine`. Recommended: new branch off `main` because widget V1 deploy gate is data-driven and independent. Final call deferred to Jason in a separate discussion.

---

## 12. Reuse map

| Need                 | Existing asset                                          | Path                      |
| -------------------- | ------------------------------------------------------- | ------------------------- |
| Resend client        | `apps/web/lib/email/send-lead-notification.ts` patterns | reuse                     |
| Twilio send          | `apps/web/lib/sms/send.ts`                              | direct reuse              |
| CASL STOP/HELP/START | `apps/web/lib/sms/keywords.ts`, `process.ts`            | direct reuse              |
| Auth gate            | `apps/web/lib/auth/*`                                   | direct reuse              |
| Supabase clients     | `apps/web/lib/supabase/{admin,client,server}.ts`        | direct reuse              |
| Anthropic client     | `apps/web/app/api/widget/chat/route.ts` pattern         | pattern reuse             |
| JWT (jose)           | `apps/web/lib/widget/*` token helpers                   | pattern reuse, new secret |
| Turnstile (CSRF)     | widget V1 implementation                                | pattern reuse             |
| Admin shell          | `apps/web/app/api/admin/{patients,sms-usage}/*`         | pattern reuse             |

---

## 13. Out of scope explicitly

- AI variant A/B testing (Variants B–F). Phase 2 spec.
- Photo upload. Phase 2 spec.
- JaneApp integration / automatic patient discovery. Phase 2 spec.
- Multi-language (中文 patients). Phase 2 if signal warrants.
- Reply handling on inbound SMS replies to the review SMS (e.g. patient texts back "thanks"). The existing SMS webhook ignores unknown senders; review SMS replies fall through. Acceptable for v1.
- Production 10DLC CA number. Operational task tracked outside this spec.

---

## 14. Approval

This spec is the source of truth for Phase 1.0 of S2. Changes require Jason's review. The implementation plan (next step) decomposes this spec into ordered tasks for the test-driven-development cycle.
