# S2 Review Engine — Operator Runbook

> Phase 1 of the V-Health post-visit review pipeline. Spec: `docs/superpowers/specs/2026-05-16-s2-review-engine-design.md`. Plan: `docs/superpowers/plans/2026-05-16-s2-review-engine.md`.

## Pre-flight checklist

Before deploying `feat/s2-review-engine` to anything other than a local dev server:

- [ ] Migrations 016 + 017 applied to the target Supabase project. The migration files at `supabase/migrations/016_review_requests.sql` and `017_review_funnel_events.sql` are **idempotent** — 016 uses `CREATE TABLE IF NOT EXISTS` for `clinics` and `therapists`, and `ON CONFLICT` on the V-Health seed, so it is safe to re-run.
- [ ] `pnpm gen:types` run after migrations apply, to refresh `apps/web/lib/supabase/types.ts`.
- [ ] V-Health `google_place_id` set on the `clinics` row. The seed leaves this NULL — see "Place ID" below.

## Env vars (Vercel + local)

| Var | Required | Notes |
|-----|----------|-------|
| `REVIEW_TOKEN_SECRET` | yes | ≥ 32 hex chars; **distinct** from `WIDGET_SESSION_SECRET` |
| `REVIEW_BASE_URL` | yes | e.g. `https://physio.app`; used to build short links |
| `REVIEW_TEST_MODE` | yes | `true` for Stages 0-1; `false` for Stages 2+ |
| `REVIEW_TEST_RECIPIENT_EMAIL` | when `REVIEW_TEST_MODE=true` | Jason's test inbox |
| `REVIEW_TEST_RECIPIENT_PHONE` | when `REVIEW_TEST_MODE=true` | Jason's test phone (E.164); must be a Twilio Verified Caller ID on trial |
| `RESEND_WEBHOOK_SECRET` | yes (for delivered/opened tracking) | from Resend dashboard webhook config |
| `RESEND_API_KEY` | yes | already configured (reused from existing email infra) |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_PHONE_NUMBER` | yes | already configured (reused) |
| `ANTHROPIC_API_KEY_WIDGET` | yes | already configured (reused for Haiku 4.5) |
| `ADMIN_EMAIL` | yes | the email of the admin user; `requireAdminAuth` rejects everything else |

## Place ID

The V-Health Google Maps Place ID must be set on the `clinics` row before Stage 2.

To find it: open https://developers.google.com/maps/documentation/javascript/examples/places-placeid-finder, search "V-Health Rehab Clinic Calgary", and copy the Place ID (starts with `ChIJ`).

Then:

```sql
UPDATE public.clinics
SET google_place_id = 'ChIJ_real_value_here',
    google_maps_url = 'https://www.google.com/maps/place/?q=place_id:ChIJ_real_value_here'
WHERE slug = 'vhealth';
```

Stages 0 and 1 run with `REVIEW_TEST_MODE=true`, so the deep link is never user-facing — the placeholder NULL is fine until Stage 2.

## Stage 0 — internal plumbing smoke

1. Deploy `feat/s2-review-engine` to Vercel Preview.
2. Set `REVIEW_TEST_MODE=true` and configure both test recipients to Jason's inbox/phone.
3. Visit `/dashboard/review-requests` as the admin user. Fill the form:
   - Clinic: V-Health
   - Patient: any name; email + phone can be any value (test mode overrides them).
   - Channel: `both`.
   - Check the consent box. Submit.
4. Within 30 seconds, verify:
   - Email arrives at the test inbox.
   - SMS arrives at the test phone (with Twilio trial prefix).
   - The admin table row shows `sent` and (for email) `delivered` + `opened` ticks within 1-2 minutes.
5. Click the email link → landing page renders the **patient name from the form** (not the test override).
6. Submit `neck pain better Jimmy` → draft appears within ~3s.
7. Click **Copy draft** → admin row gains the `copied` tick.
8. Click **Open Google Maps** → admin row gains the `redirected` tick.
9. Open the email's unsubscribe link → confirmation page shows; sending again to the same email/phone is rejected with `send_failed` / `reason: opted_out`.

## Stage 1 — friend alpha

- Keep `REVIEW_TEST_MODE=false`, but send only to consenting friends (Jason + 2-3) using their real contact info.
- Track click-through and copy rate over 3 days.
- Pass criteria: click rate > 50%, copy rate > 30%, zero crashes.

## Stage 2 — V-Health soft launch (email only)

Pre-conditions:
- `REVIEW_TEST_MODE=false`.
- V-Health `google_place_id` populated (see above).
- David Wang has confirmed CASL consent for V-Health patients **in writing** (WhatsApp screenshot kept in `docs/operations/`).

Then:
- Channel = `email` only.
- 5-10 sends/day for 14 days.
- Pass criteria: first real V-Health Google review traceable via operator-set `verified_at` on the request row.

## Stage 3 — V-Health full (email + SMS)

- Same as Stage 2 but channel = `both`.
- Pre-condition: production Canadian 10DLC number provisioned at Twilio.
- 30-day observation. Day 14 and Day 30 data reviews scheduled separately.

## Stage 4 — Productize for clinic #2

Onboarding checklist:
1. `INSERT INTO public.clinics (slug, name, domain, review_sender_name, google_place_id, google_maps_url) VALUES (...)`.
2. `INSERT INTO public.therapists (clinic_id, name, role) VALUES (...)` for each.
3. Add the clinic owner's email to `ADMIN_EMAIL` (or extend `requireAdminAuth` to support multi-clinic admin lookup).
4. Verify access to `/dashboard/review-requests`.
5. Time to first send ≤ 20 minutes.

## Troubleshooting

| Symptom | Likely cause |
|---------|--------------|
| Resend webhook events not landing | Signature secret mismatch — Resend regenerates `RESEND_WEBHOOK_SECRET` on rotation |
| SMS bouncing on Twilio trial | Destination phone not in Verified Caller IDs |
| Landing page `notFound` | JWT expired (14 days) or request `status` is `revoked`/`expired` — send a new one |
| Engine throws "Patient consent must be confirmed" | The admin form did not check the consent box — but a curl bypass would also hit this; investigate |
| `Clinic not found` | Migration 016 not applied to this environment, or wrong `clinicId` from admin form |
| Type errors after pulling migrations | Run `pnpm gen:types` to refresh `apps/web/lib/supabase/types.ts` |

## Funnel queries

To inspect the funnel for a single request:

```sql
SELECT event_type, occurred_at, metadata
FROM public.review_funnel_events
WHERE request_id = '<uuid>'
ORDER BY occurred_at;
```

To compute conversion across all sends in the last 30 days:

```sql
WITH counts AS (
  SELECT
    request_id,
    bool_or(event_type IN ('sent_email','sent_sms')) AS sent,
    bool_or(event_type = 'link_clicked') AS clicked,
    bool_or(event_type = 'copy_clicked') AS copied,
    bool_or(event_type = 'maps_redirected') AS redirected
  FROM public.review_funnel_events
  WHERE occurred_at > now() - interval '30 days'
  GROUP BY request_id
)
SELECT
  count(*) FILTER (WHERE sent) AS sent_count,
  count(*) FILTER (WHERE clicked) AS clicked_count,
  count(*) FILTER (WHERE copied) AS copied_count,
  count(*) FILTER (WHERE redirected) AS redirected_count
FROM counts;
```

To list requests whose Google review was operator-confirmed:

```sql
SELECT id, patient_name, channel, verified_at
FROM public.review_requests
WHERE verified_at IS NOT NULL
ORDER BY verified_at DESC;
```
