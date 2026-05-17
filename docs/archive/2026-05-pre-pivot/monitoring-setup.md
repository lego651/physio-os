# Monitoring Setup

This document describes the monitoring stack for V-Health and the manual configuration steps required in external dashboards.

---

## 1. Vercel Analytics

`@vercel/analytics` and `@vercel/speed-insights` are installed and wired into `apps/web/app/layout.tsx`. They activate automatically on Vercel deployments with no additional configuration.

- **Web Analytics** — page views, unique visitors, top pages. View in the Vercel dashboard under **Analytics**.
- **Speed Insights** — Core Web Vitals (LCP, CLS, INP) per route. View under **Speed Insights**.

No environment variables are required. Both components are no-ops in local development.

---

## 2. Sentry

Sentry is integrated via `@sentry/nextjs`. Config files:

- `apps/web/sentry.client.config.ts`
- `apps/web/sentry.server.config.ts`
- `apps/web/sentry.edge.config.ts`

Required environment variables (set in Vercel project settings):

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SENTRY_DSN` | Client-side DSN (public) |
| `SENTRY_DSN` | Server-side DSN |
| `SENTRY_AUTH_TOKEN` | For source map uploads during build |
| `SENTRY_ORG` | Sentry organisation slug |
| `SENTRY_PROJECT` | Sentry project slug |

### Recommended Alert Rules (configure in Sentry dashboard)

Navigate to **Alerts → Create Alert Rule** for each rule below.

#### Rule 1 — Any unresolved error → email

| Field | Value |
|---|---|
| Environment | `production` |
| Conditions | `An event is seen` |
| Filters | Issue is `Unresolved` |
| Actions | Send email to team / owner |
| Rate limit | Once per issue |

#### Rule 2 — Error spike (5+ in 1 hour) → high-priority alert

| Field | Value |
|---|---|
| Environment | `production` |
| Alert type | **Metric alert** → Error count |
| Threshold | `5` errors in `1 hour` |
| Actions | Send email + PagerDuty / Slack (if connected) |

#### Rule 3 — Claude API failures

| Field | Value |
|---|---|
| Environment | `production` |
| Conditions | `An event is seen` |
| Filters | `error.message` contains `anthropic` OR `claude` OR `AI generation failed` |
| Actions | Send email — mark high priority |

These events are generated in `apps/web/app/api/cron/nudge/route.ts` when `generateText` throws.

#### Rule 4 — Twilio SMS send failures

| Field | Value |
|---|---|
| Environment | `production` |
| Conditions | `An event is seen` |
| Filters | `error.message` contains `Twilio send failed` OR `TwilioSendError` |
| Actions | Send email — mark high priority |

These events are generated in `apps/web/lib/sms/send.ts`.

#### Rule 5 — SMS cost threshold exceeded (fatal)

| Field | Value |
|---|---|
| Environment | `production` |
| Conditions | `An event is seen` |
| Filters | `level` is `fatal` AND `tags.cron` equals `sms-cost-alert` |
| Actions | Send email immediately (no rate limit — this fires at most once per day) |

This event is captured by the `sms-cost-alert` cron when monthly spend exceeds $40.

---

## 3. SMS Cost Alert Cron

**Route:** `GET /api/cron/sms-cost-alert`  
**Schedule:** Daily at 09:00 UTC (`0 9 * * *` in `apps/web/vercel.json`)  
**Auth:** Bearer `CRON_SECRET` (same as other cron routes)

### What it does

1. Queries the `sms_usage` table for the current calendar month's cost estimate.
2. If cost ≤ $40 — exits silently.
3. If cost > $40:
   - Logs an error to stdout (visible in Vercel function logs).
   - Captures a `fatal`-level Sentry event (triggers Rule 5 above).
   - Sends an email to `ADMIN_EMAIL` via Resend if `RESEND_API_KEY` is set.

### Required environment variables

| Variable | Required | Description |
|---|---|---|
| `CRON_SECRET` | Yes | Bearer token Vercel sends with cron requests |
| `ADMIN_EMAIL` | Yes | Alert destination (already used for admin auth) |
| `RESEND_API_KEY` | Optional | Resend API key for email delivery. If absent, only Sentry fires. |

### Setting up Resend (optional)

1. Sign up at [resend.com](https://resend.com) — the free tier (3,000 emails/month) is sufficient.
2. Verify the sender domain (`vhealth.ai`) under **Domains**.
3. Create an API key under **API Keys** with "Sending access".
4. Add `RESEND_API_KEY` to Vercel environment variables (Production only).

The `from` address is hardcoded to `alerts@vhealth.ai` in `apps/web/app/api/cron/sms-cost-alert/route.ts`. Update it to match your verified Resend domain if different.

### Threshold

The $40 threshold is defined as `COST_THRESHOLD` in the cron route and matches `ALERT_THRESHOLD` in `apps/web/lib/sms/cost-tracker.ts`. Update both if the threshold changes.

---

## 4. Log Drains (future)

Vercel log drains can forward function logs to Datadog, Axiom, or Logtail for structured querying. Not configured yet — the `console.error` calls in cron routes are already structured with `[cron-name]` prefixes to make log queries straightforward when a drain is added.
