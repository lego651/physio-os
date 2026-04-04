# Sprint 5 — Code Review & Refactor Tickets

**Reviewer:** Tech Lead (automated audit)
**Date:** 2026-04-03
**Scope:** All 11 S5 tickets (S501–S511) across 8 merged PRs (#20–#28)
**Severity legend:** 🔴 Critical · 🟠 High · 🟡 Medium · 🟢 Low

---

## Summary

Sprint 5 delivers the admin dashboard: patient list with status badges, patient
detail with charts and conversation logs, patient management (add/edit/toggle),
send check-in, overview cards, Sentry integration, and a mobile responsiveness
pass. The frontend work is generally solid, but there are **unintegrated
components, missing authentication on all admin API routes, an N+3 waterfall
query in the patient list, duplicated utility functions, no error/loading
boundaries, and a rate-limit check that can be trivially bypassed**. These must
be resolved before production use.

**Total issues: 16**
- 🔴 Critical: 3
- 🟠 High: 5
- 🟡 Medium: 5
- 🟢 Low: 3

---

## R5-01 — Admin API routes have zero authentication

**Severity:** 🔴 Critical
**Files:**
- `apps/web/app/api/admin/patients/route.ts`
- `apps/web/app/api/admin/patients/[id]/route.ts`
- `apps/web/app/api/admin/patients/[id]/toggle-active/route.ts`
- `apps/web/app/api/admin/patients/[id]/send-checkin/route.ts`
- `apps/web/app/api/admin/patients/[id]/messages/route.ts`

**Problem:**
All five admin API routes accept requests from anyone with the URL. There is no
session validation, no bearer token check, no middleware guard. The existing
middleware only handles Supabase session refresh for `/dashboard/:path*` pages,
but the `/api/admin/*` routes are completely open.

Compare with `api/admin/sms-usage/route.ts` which correctly uses
`verifyBearerToken()`. The new S5 routes do not.

Any unauthenticated caller can:
- Create patients with arbitrary data (`POST /api/admin/patients`)
- Edit any patient (`PATCH /api/admin/patients/:id`)
- Toggle any patient's active status
- Trigger SMS sends to any phone number on file
- Read all conversation history for any patient

**Action:**
1. Add a shared `requireAdminAuth()` helper or middleware that validates the
   Supabase session and checks the user has an admin role.
2. Apply it as the first guard in every `api/admin/*` route handler.
3. Add the `/api/admin/:path*` pattern to the middleware matcher so session
   cookies are refreshed for API calls too.
4. Return 401 if unauthenticated, 403 if authenticated but not admin.

**Acceptance:**
- Unauthenticated requests to all admin API routes return 401.
- Authenticated non-admin users return 403.
- Authenticated admin users can proceed normally.
- Integration test covers the auth guard.

---

## R5-02 — Components built but never wired into pages

**Severity:** 🔴 Critical
**Files:**
- `apps/web/app/(clinic)/dashboard/patients/[id]/conversation-log.tsx` — **not imported in `[id]/page.tsx`**
- `apps/web/app/(clinic)/dashboard/patients/[id]/weekly-reports.tsx` — **not imported in `[id]/page.tsx`**
- `apps/web/app/(clinic)/dashboard/patients/[id]/send-checkin-button.tsx` — **not imported in `[id]/page.tsx`**
- `apps/web/app/(clinic)/dashboard/patients/[id]/toggle-active-button.tsx` — **not imported in `[id]/page.tsx`**
- `apps/web/app/(clinic)/dashboard/patients/add-patient-dialog.tsx` — **not imported in `patients/page.tsx`**
- `apps/web/app/(clinic)/dashboard/patients/edit-patient-dialog.tsx` — **not imported in `[id]/page.tsx`**

**Problem:**
Six components were implemented (S503, S504, S507, S508) but never imported or
rendered on any page. They are dead code. The patient detail page only renders
`MetricOverviewCards`, `TrendChart`, and `MetricsTable`. The patient list page
only renders `OverviewCards` and `PatientList`. The Add Patient dialog, Edit
Patient dialog, Conversation Log, Weekly Reports, Send Check-in button, and
Toggle Active button are unreachable in the live app.

**Action:**
1. In `[id]/page.tsx`:
   - Import and render `<ConversationLog patientId={patient.id} />`
   - Import and render `<WeeklyReports patientId={patient.id} />`
   - Import and render `<SendCheckinButton>` with required props
   - Import and render `<ToggleActiveButton>` with required props
   - Import and render `<EditPatientDialog>` with required props
2. In `patients/page.tsx`:
   - Import and render `<AddPatientDialog />` in the header area
3. Consider using `Tabs` component (already installed) to organize the detail
   page into Profile / Metrics / Conversations / Reports tabs.

**Acceptance:**
- All six components are visible and functional in the running app.
- Navigating to `/dashboard/patients/[id]` shows conversation log, reports,
  send check-in, toggle active, and edit buttons.
- Patient list page shows the "Add Patient" button.

---

## R5-03 — Send check-in rate limit is easily bypassed

**Severity:** 🔴 Critical
**File:** `apps/web/app/api/admin/patients/[id]/send-checkin/route.ts`

**Problem:**
The rate limit check queries messages where `role = 'assistant'` and
`channel = 'sms'` since midnight today. This counts **all** assistant SMS
messages (including automated nudges, AI responses, etc.), not specifically
admin-initiated check-ins. Two issues:

1. **False positives:** If the AI already responded via SMS today, the admin
   cannot send a manual check-in even though the ticket spec says "max 1
   **admin** check-in per patient per day."
2. **Missing `admin_initiated` marker:** The S508 ticket spec explicitly says
   to add metadata `{ "admin_initiated": true }` or a boolean column. The
   code saves the message with zero metadata, making it impossible to
   distinguish admin check-ins from AI responses for rate limiting.
3. **Timezone issue:** `todayStart.setHours(0, 0, 0, 0)` uses server-local
   timezone, not UTC. On Vercel Functions the timezone is UTC, but this is
   fragile and will break in local development or if the runtime timezone
   changes.

**Action:**
1. Add `metadata: { admin_initiated: true }` (or a dedicated column) when
   inserting the check-in message.
2. Update the rate limit query to filter on `metadata->>'admin_initiated' = 'true'`
   instead of all assistant SMS messages.
3. Use UTC-based date for the rate limit window: `todayStart.setUTCHours(0, 0, 0, 0)`.

**Acceptance:**
- Admin can send check-in even if AI already responded via SMS today.
- Admin cannot send more than 1 check-in per patient per day.
- Rate limit query specifically targets admin-initiated messages.
- Timezone is explicitly UTC.

---

## R5-04 — N+3 waterfall query in patient list page

**Severity:** 🟠 High
**File:** `apps/web/app/(clinic)/dashboard/patients/page.tsx`

**Problem:**
`getPatients()` runs 3 sequential queries:
1. `SELECT * FROM patients`
2. `SELECT * FROM messages WHERE patient_id IN (...)`
3. `SELECT * FROM metrics WHERE patient_id IN (...)`

These are fired sequentially (no `Promise.all`). With 30 patients, this means
3 round-trips to the database. Additionally, query 2 fetches **all messages
for all patients** just to find the most recent one per patient. Query 3 fetches
**all metrics for all patients** just to compute aggregates.

The metrics loop also iterates the full metrics array **twice** — once in the
initial loop (lines 70–92) and again in the `painSums` computation (lines 95–106).
The initial `avgPain7dMap` loop on line 78 computes nothing useful (it sets
the value to the first pain_level and then the `else` branch is empty).

**Action:**
1. Wrap the three queries in `Promise.all()` to parallelize.
2. Use Supabase aggregate views or DB functions to compute per-patient
   aggregates server-side rather than fetching all rows.
3. At minimum: add `.limit()` to the messages query with a subquery or
   `DISTINCT ON` pattern to only fetch the latest message per patient.
4. Remove the dead code in the initial `avgPain7dMap` loop (lines 78–84)
   since it's completely overwritten by the `painSums` loop below it.

**Acceptance:**
- Patient list query completes in < 500ms with 30 patients.
- No full-table scans on messages or metrics.
- Dead code removed.

---

## R5-05 — `getWeekStart` / `getMondayOf` duplicated 4 times

**Severity:** 🟠 High
**Files:**
- `apps/web/app/(clinic)/dashboard/patients/page.tsx` — `getWeekStart()` (local time)
- `apps/web/app/(clinic)/dashboard/patients/overview-cards.tsx` — `getMondayOf()` (UTC)
- `apps/web/app/(clinic)/dashboard/patients/[id]/metric-overview-cards.tsx` — `getWeekStart()` (local time)
- `apps/web/app/api/cron/weekly-report/route.ts` — `getWeekStart()` (UTC)

**Problem:**
Four separate implementations of "get start of week." Worse, they disagree:
- `page.tsx` and `metric-overview-cards.tsx` use **local time** (`getDay()`, `setHours()`)
- `overview-cards.tsx` uses **UTC** (`getUTCDay()`, `setUTCHours()`)
- `weekly-report/route.ts` uses **UTC** with a different algorithm `(dayOfWeek + 6) % 7`

On Vercel (UTC runtime), local-time functions happen to work, but they will
produce wrong results in local dev or any non-UTC environment, leading to
week-boundary mismatches between the dashboard overview cards and the patient
detail metric cards.

**Action:**
1. Create a single shared utility `lib/utils/date.ts` with `getWeekStartUTC()`.
2. Replace all 4 implementations with the shared one.
3. Ensure all date arithmetic uses UTC methods consistently.

**Acceptance:**
- Single source of truth for week-start calculation.
- All dashboard components agree on which week it is.
- Works correctly in both UTC and non-UTC environments.

---

## R5-06 — No `loading.tsx` or `error.tsx` boundaries for dashboard routes

**Severity:** 🟠 High
**Files:**
- `apps/web/app/(clinic)/dashboard/patients/loading.tsx` — **missing**
- `apps/web/app/(clinic)/dashboard/patients/error.tsx` — **missing**
- `apps/web/app/(clinic)/dashboard/patients/[id]/loading.tsx` — **missing**
- `apps/web/app/(clinic)/dashboard/patients/[id]/error.tsx` — **missing**

**Problem:**
Both the patient list and patient detail pages are server components with
`force-dynamic`. When Supabase queries take > 1s (cold start, slow network),
users see a blank white page. If queries fail (DB down, network error), users
see an unhandled Next.js error page with a stack trace.

Neither `loading.tsx` (for streaming/suspense fallback) nor `error.tsx` (for
error boundaries) exist anywhere in the dashboard route tree.

**Action:**
1. Add `loading.tsx` at `dashboard/patients/` and `dashboard/patients/[id]/`
   with skeleton components (card outlines, pulsing bars).
2. Add `error.tsx` at `dashboard/patients/` and `dashboard/patients/[id]/`
   with a user-friendly error message and retry button.
3. Optionally wrap `OverviewCards` in its own `<Suspense>` boundary so the
   patient list renders immediately while cards load.

**Acceptance:**
- Loading skeleton visible during page load.
- Error state shows friendly message with retry button.
- Patient list is not blocked by overview cards loading.

---

## R5-07 — `SENTRY_DSN` missing from `.env.example`

**Severity:** 🟠 High
**Files:**
- `.env.example`
- `apps/web/sentry.client.config.ts`

**Problem:**
S510 added Sentry integration requiring `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`,
`SENTRY_ORG`, and `SENTRY_PROJECT` environment variables. None of these are
documented in `.env.example`. New developers or CI environments will build
without source map uploads and have silent Sentry initialization failures.

The `sentry.client.config.ts` does not guard against a missing DSN — if
`SENTRY_DSN` is undefined, `Sentry.init({ dsn: undefined })` runs silently
but the client SDK still bundles (~30KB) with no benefit.

Also: `SENTRY_DSN` is not prefixed with `NEXT_PUBLIC_` but is used in
`sentry.client.config.ts`, which runs in the browser. Without the prefix,
Next.js will not inject it into the client bundle, making client-side error
tracking non-functional.

**Action:**
1. Add `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` to
   `.env.example` with placeholder values.
2. Rename to `NEXT_PUBLIC_SENTRY_DSN` for client-side usage (or use Sentry's
   `tunnelRoute` option to proxy through server).
3. Add a guard in `sentry.client.config.ts`:
   ```ts
   const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN
   if (dsn) { Sentry.init({ dsn, ... }) }
   ```
4. Document required Sentry env vars in README.

**Acceptance:**
- `.env.example` contains all Sentry env vars.
- Client-side Sentry actually captures errors in production.
- No Sentry bundle loaded when DSN is not configured (dev environment).

---

## R5-08 — No input ID validation on admin API route params

**Severity:** 🟡 Medium
**Files:**
- `apps/web/app/api/admin/patients/[id]/route.ts`
- `apps/web/app/api/admin/patients/[id]/toggle-active/route.ts`
- `apps/web/app/api/admin/patients/[id]/send-checkin/route.ts`
- `apps/web/app/api/admin/patients/[id]/messages/route.ts`

**Problem:**
The `[id]` route parameter is used directly in Supabase queries without any
format validation. If the `patients` table uses UUID primary keys, passing
`id=../../etc/passwd` or `id=1; DROP TABLE` won't cause SQL injection (Supabase
parameterizes queries), but it will produce unhelpful 500 errors from Supabase
trying to match a non-UUID string against a UUID column.

**Action:**
1. Add a UUID format validation at the top of each handler:
   ```ts
   const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
   if (!UUID_RE.test(id)) return Response.json({ error: 'Invalid patient ID' }, { status: 400 })
   ```
2. Or create a shared `validateUUID()` utility in `lib/utils/`.

**Acceptance:**
- Non-UUID `[id]` values return 400 with a clear error.
- No 500 errors from invalid ID formats.

---

## R5-09 — Inconsistent Response API usage across admin routes

**Severity:** 🟡 Medium
**Files:**
- `apps/web/app/api/admin/patients/route.ts` — uses `Response.json()`
- `apps/web/app/api/admin/patients/[id]/route.ts` — uses `Response.json()`
- `apps/web/app/api/admin/patients/[id]/send-checkin/route.ts` — uses `NextResponse.json()` + imports `NextRequest`
- `apps/web/app/api/admin/patients/[id]/messages/route.ts` — uses `NextResponse.json()` + imports `NextRequest`
- `apps/web/app/api/admin/patients/[id]/toggle-active/route.ts` — uses `Response.json()`

**Problem:**
Some routes use Web API `Response.json()` while others import `NextResponse`
from `next/server`. While both work, this inconsistency increases cognitive
overhead and creates unnecessary imports. The routes also inconsistently
expose raw Supabase error messages to clients (`error.message`), which may
leak internal schema details.

**Action:**
1. Standardize on `Response.json()` (Web standard, no import needed) across
   all admin routes. Remove `NextRequest`/`NextResponse` imports where
   `Request` and `Response` suffice.
2. Never return `error.message` from Supabase directly. Use generic error
   messages and log the actual error server-side.

**Acceptance:**
- All admin routes use consistent Response API.
- No Supabase error messages leaked to clients.

---

## R5-10 — Patient detail page fetches ALL metrics without limit

**Severity:** 🟡 Medium
**File:** `apps/web/app/(clinic)/dashboard/patients/[id]/page.tsx`

**Problem:**
`getPatientDetail()` queries all metrics for a patient with no `.limit()`:
```ts
const { data: metrics } = await supabase
  .from('metrics')
  .select('...')
  .eq('patient_id', id)
  .order('recorded_at', { ascending: false })
```

For a patient with 6+ months of daily check-ins (180+ rows), this fetches and
serializes all of them into the page props, then passes the entire array to
three client components (`MetricOverviewCards`, `TrendChart`, `MetricsTable`).

The `MetricsTable` already implements client-side pagination (showing 20 at a
time), but all 180+ rows are still shipped in the initial HTML payload.

**Action:**
1. For `MetricOverviewCards`: only fetch this-week metrics (add date filter).
2. For `TrendChart`: default to 30 days, only fetch that range initially.
3. For `MetricsTable`: implement server-side pagination — fetch first 20 rows,
   load more via API call.
4. At minimum: add a `.limit(200)` safety valve so the page doesn't crash
   with very active patients.

**Acceptance:**
- Initial page load fetches ≤ 50 metric rows.
- Table "load more" fetches additional pages from the server.
- Page load time remains < 2s with 200+ metrics.

---

## R5-11 — `OverviewCards` (server) and `PatientList` (client) duplicate data fetching

**Severity:** 🟡 Medium
**Files:**
- `apps/web/app/(clinic)/dashboard/patients/page.tsx`
- `apps/web/app/(clinic)/dashboard/patients/overview-cards.tsx`

**Problem:**
The patients page calls `getPatients()` which fetches all patients, messages,
and metrics. Then `<OverviewCards />` is a separate server component that
independently queries patients, messages, and metrics again with its own
set of 5 Supabase calls.

This means the patient list page makes **8 Supabase queries** total (3 from
`getPatients` + 5 from `OverviewCards`) when it could share the data.

**Action:**
1. Consolidate: fetch the aggregate data once in the parent page and pass it
   to both `PatientList` and `OverviewCards` as props.
2. Or: make `OverviewCards` accept pre-computed stats from the parent's
   already-fetched patient data.

**Acceptance:**
- Patient list page makes ≤ 5 total database queries.
- Overview cards and patient list render from the same data source.

---

## R5-12 — `AddPatientDialog` hardcodes +1 country code

**Severity:** 🟡 Medium
**File:** `apps/web/app/(clinic)/dashboard/patients/add-patient-dialog.tsx`

**Problem:**
The `buildPhone()` function hardcodes `+1` (North America):
```ts
function buildPhone(local: string) {
  const digits = local.replace(/\D/g, '')
  return `+1${digits}`
}
```
The helper text says "North American numbers only (+1)." For a health app that
serves Chinese-speaking patients, this is a significant limitation. A patient
in China (+86), Hong Kong (+852), or other regions cannot be added.

Also: no validation that the resulting E.164 number has the correct digit count
(10 digits for NA). Entering 5 digits would produce `+112345` which passes the
E.164 regex on the backend but is not a valid phone number.

**Action:**
1. Add a country code selector (at least +1 and +86 for MVP).
2. Validate digit count matches the selected country code (10 for +1, 11 for +86).
3. Or: accept full E.164 input and validate format client-side.

**Acceptance:**
- Admin can add patients with non-US phone numbers.
- Invalid digit counts are rejected before submission.

---

## R5-13 — Conversation log image URLs rendered without signed URL refresh

**Severity:** 🟠 High
**File:** `apps/web/app/(clinic)/dashboard/patients/[id]/conversation-log.tsx`

**Problem:**
The S503 ticket spec explicitly calls out: "MMS images: signed URL may expire
→ generate fresh on page load." The current implementation renders
`message.media_urls` directly as `<img src={url}>`. If these are Supabase
Storage signed URLs, they expire (default 1 hour). After expiration, images
show as broken.

The message API endpoint (`/api/admin/patients/[id]/messages/route.ts`) also
returns `media_urls` as stored — it does not regenerate signed URLs.

**Action:**
1. In the messages API route, detect Supabase Storage URLs and regenerate
   signed URLs before returning them.
2. Or: store public URLs / permanent paths instead of signed URLs in the
   messages table, and generate signed URLs only at render time.
3. Add `onerror` fallback on `<img>` tags to show a placeholder when URLs
   expire.

**Acceptance:**
- MMS images display correctly even if the message is > 1 hour old.
- Broken image fallback is shown if URL generation fails.

---

## R5-14 — `TrendChart` Recharts bundle shipped to all users

**Severity:** 🟢 Low
**File:** `apps/web/app/(clinic)/dashboard/patients/[id]/trend-chart.tsx`

**Problem:**
Recharts is a heavy dependency (~200KB gzipped). The `TrendChart` component
is `'use client'` and imports `LineChart, Line, XAxis, YAxis, CartesianGrid,
Tooltip, ResponsiveContainer, Legend` directly. These are all tree-shakeable,
but without dynamic import they are included in the page's initial JS bundle.

For the patient detail page, the chart is below the fold and not needed for
first contentful paint.

**Action:**
1. Lazy-load `TrendChart` with `dynamic(() => import('./trend-chart'), { ssr: false })`.
2. Show a loading skeleton placeholder while the chart loads.

**Acceptance:**
- Recharts bundle only loads when the chart is in viewport or after page load.
- Page LCP is not affected by chart bundle size.

---

## R5-15 — `relativeTime()` in `patient-list.tsx` doesn't handle future dates

**Severity:** 🟢 Low
**File:** `apps/web/app/(clinic)/dashboard/patients/patient-list.tsx`

**Problem:**
`relativeTime()` computes `now - date`. If a message's `created_at` is slightly
in the future (clock skew between Supabase and the browser), the diff becomes
negative and the function returns "Just now" (correct by accident because
`minutes < 1`). However, if the server clock is > 1 minute ahead, it would
return "NaN m ago" or a negative number.

Additionally, this is a custom implementation when `Intl.RelativeTimeFormat`
is available in all modern browsers, or a library like `date-fns/formatDistanceToNow`
could provide a more robust and localized solution.

**Action:**
1. Add a guard: `if (diff < 0) return 'Just now'`.
2. Consider using `Intl.RelativeTimeFormat` for localization support.

**Acceptance:**
- No NaN or negative time values displayed.
- Works for both EN and CN locales.

---

## R5-16 — Mobile responsiveness: touch targets and accessibility gaps

**Severity:** 🟢 Low
**Files:**
- `apps/web/app/(clinic)/dashboard/patients/patient-list.tsx`
- `apps/web/app/(clinic)/dashboard/patients/[id]/trend-chart.tsx`
- `apps/web/app/(clinic)/dashboard/patients/[id]/metrics-table.tsx`

**Problem:**
The S511 ticket acceptance criteria requires "Touch targets ≥ 44px on all
interactive elements." Several elements fall short:

1. Sort buttons in `patient-list.tsx` use `size="sm"` (32px height).
2. Range selector buttons in `trend-chart.tsx` use `size="sm"`.
3. "Load more" button in `metrics-table.tsx` uses `size="sm"`.
4. Patient cards themselves are clickable Links but the card padding (`py-3`)
   may produce touch targets < 44px on single-line entries.
5. No `aria-label` on sort buttons or range buttons.

**Action:**
1. Use `size="default"` or add `min-h-[44px] min-w-[44px]` to all interactive
   elements on mobile breakpoints.
2. Add `aria-label` to icon-only or abbreviated buttons.
3. Test at 375px viewport width for compliance.

**Acceptance:**
- All touch targets ≥ 44px at 375px viewport.
- Screen reader announces button purposes correctly.

---

## Appendix: Files Audited

| File | Ticket | Type |
|------|--------|------|
| `patients/page.tsx` | S501, S505, S506, S509 | Server component |
| `patients/patient-list.tsx` | S501, S505, S506 | Client component |
| `patients/overview-cards.tsx` | S509 | Server component |
| `patients/[id]/page.tsx` | S502 | Server component |
| `patients/[id]/trend-chart.tsx` | S502 | Client component |
| `patients/[id]/metric-overview-cards.tsx` | S502 | Client component |
| `patients/[id]/metrics-table.tsx` | S502 | Client component |
| `patients/[id]/conversation-log.tsx` | S503 | Client component |
| `patients/[id]/weekly-reports.tsx` | S504 | Server component |
| `patients/[id]/send-checkin-button.tsx` | S508 | Client component |
| `patients/[id]/toggle-active-button.tsx` | S507 | Client component |
| `patients/add-patient-dialog.tsx` | S507 | Client component |
| `patients/edit-patient-dialog.tsx` | S507 | Client component |
| `api/admin/patients/route.ts` | S507 | API route |
| `api/admin/patients/[id]/route.ts` | S507 | API route |
| `api/admin/patients/[id]/toggle-active/route.ts` | S507 | API route |
| `api/admin/patients/[id]/send-checkin/route.ts` | S508 | API route |
| `api/admin/patients/[id]/messages/route.ts` | S503 | API route |
| `dashboard-shell.tsx` | S511 | Client component |
| `sentry.client.config.ts` | S510 | Config |
| `sentry.server.config.ts` | S510 | Config |
| `sentry.edge.config.ts` | S510 | Config |
| `instrumentation.ts` | S510 | Config |
| `next.config.ts` | S510 | Config |
