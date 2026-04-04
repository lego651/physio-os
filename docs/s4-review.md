# Sprint 4 — Code Review & Refactor Tickets

**Reviewer:** Tech Lead (automated audit)
**Date:** 2026-04-03
**Scope:** All 10 S4 commits across branches `feat/s4-*`
**Severity legend:** 🔴 Critical · 🟠 High · 🟡 Medium · 🟢 Low

---

## Summary

Sprint 4 delivers weekly report generation, inactivity nudges, pattern detection,
SMS cost tracking, and supporting cron infrastructure. Overall architecture is
reasonable but there are **migration conflicts, race conditions, missing null
guards on AI output, N+1 query patterns, and test-isolation problems** that need
to be resolved before these branches ship to production.

---

## R4-01 — Migration number collision (007)

**Severity:** 🔴 Critical
**Files:**
- `supabase/migrations/007_add_nudge_column.sql` (feat/s4-inactivity-nudge)
- `supabase/migrations/007_add_sms_usage.sql` (feat/s4-sms-cost-tracking)

**Problem:**
Two branches both create migration `007`. When both merge to `main`, Supabase
migration runner will fail or apply them in undefined order. This blocks
all deployments.

**Action:**
1. Renumber the second migration to `008_add_sms_usage.sql` (or whichever
   merges last).
2. Add a CI check or pre-merge script that validates migration filenames
   are strictly sequential with no duplicates.

**Acceptance:**
- `supabase db push` succeeds with both migrations applied in order.
- A linter or CI step flags duplicate migration numbers on PR open.

---

## R4-02 — Race condition in SMS cost tracker (read-then-write)

**Severity:** 🔴 Critical
**File:** `apps/web/lib/sms/cost-tracker.ts`

**Problem:**
`trackSMSUsage()` reads the current row, adds segments in JS, then upserts.
Under concurrent calls (e.g., weekly report cron sending SMS to 50 patients
via `Promise.allSettled`) the read-modify-write is not atomic — later writes
overwrite earlier ones, losing segment counts.

The code itself acknowledges this:
> "Not atomic under concurrent writes, but SMS sends are low-frequency enough
> that this is acceptable without a DB-side function."

This assumption is **wrong** for the weekly report cron which fires 50+
concurrent SMS sends at once.

**Action:**
Replace the JS read-modify-write with an atomic Postgres upsert:

```sql
INSERT INTO sms_usage (month, segments, cost_estimate, updated_at)
VALUES ($1, $2, $3, now())
ON CONFLICT (month) DO UPDATE SET
  segments = sms_usage.segments + EXCLUDED.segments,
  cost_estimate = sms_usage.cost_estimate + EXCLUDED.cost_estimate,
  updated_at = now();
```

Use `supabase.rpc('track_sms_usage', { p_segments, p_cost })` instead of
the current select → upsert pattern.

**Acceptance:**
- `trackSMSUsage(1)` called 100 times concurrently results in exactly
  `segments = 100`, not fewer.
- Unit test simulates concurrent calls and asserts correct total.

---

## R4-03 — Unchecked `output` from `Output.object` (can be undefined)

**Severity:** 🔴 Critical
**Files:**
- `packages/ai-core/src/tools/generate-report.ts` — line: `const result: ReportOutput = output`
- `packages/ai-core/src/tools/pattern-detection.ts` — line: `return output.insights`

**Problem:**
The AI SDK's `generateText` with `Output.object` returns `output` typed as
`T | undefined`. If the model fails to produce valid structured output (JSON
parse error, schema mismatch, safety refusal), `output` is `undefined`.
Both files assign or access it without a null check, causing a runtime crash:
`TypeError: Cannot read properties of undefined`.

**Action:**
Add explicit null guard:

```typescript
if (!output) {
  throw new Error('AI failed to generate structured report output')
}
```

Or provide a fallback report with pre-computed stats only.

**Acceptance:**
- When `output` is `undefined`, the function throws a descriptive error
  (not a generic `TypeError`).
- The weekly report cron's `Promise.allSettled` catches this per-patient and
  continues processing other patients.

---

## R4-04 — Inconsistent AI model defaults across files

**Severity:** 🟠 High
**Files:**
- `generate-report.ts` — `DEFAULT_MODEL = 'claude-sonnet-4-20250514'`
- `nudge/route.ts` — `DEFAULT_MODEL = 'claude-sonnet-4.5'`
- `pattern-detection.ts` — `DEFAULT_MODEL = 'claude-sonnet-4.6'`

**Problem:**
Three different model identifiers are hardcoded as defaults. If the team
decides to upgrade models, they must hunt through multiple files. Worse,
the inconsistency suggests copy-paste drift — `claude-sonnet-4.6` may not
even be a valid model ID yet.

**Action:**
1. Create a shared constant in `packages/ai-core/src/config.ts`:
   ```typescript
   export const DEFAULT_AI_MODEL = 'claude-sonnet-4-20250514'
   ```
2. Import it everywhere instead of per-file constants.
3. All files should read `process.env.AI_MODEL ?? DEFAULT_AI_MODEL`.

**Acceptance:**
- Exactly one `DEFAULT_MODEL` definition exists in the codebase.
- Changing the default in one place updates all AI callers.

---

## R4-05 — No duplicate-report guard (cron idempotency)

**Severity:** 🟠 High
**File:** `apps/web/app/api/cron/weekly-report/route.ts`

**Problem:**
If Vercel retries the cron (e.g., 504 timeout on first attempt), or if an
operator manually triggers it, the same patient gets multiple reports for the
same week. There is no `UNIQUE(patient_id, week_start)` constraint on the
`reports` table and no pre-insert check.

**Action:**
1. Add a unique constraint in a new migration:
   ```sql
   ALTER TABLE reports ADD CONSTRAINT reports_patient_week_unique
     UNIQUE (patient_id, week_start);
   ```
2. In `generateWeeklyReport`, check for an existing report before calling
   Claude:
   ```typescript
   const { data: existing } = await supabase
     .from('reports')
     .select('id')
     .eq('patient_id', patientId)
     .eq('week_start', weekStart.toISOString().slice(0, 10))
     .maybeSingle()
   if (existing) return existing as Report
   ```
3. Alternatively, use `ON CONFLICT DO NOTHING` on the insert and handle
   the conflict gracefully.

**Acceptance:**
- Running the weekly report cron twice for the same week produces exactly
  one report per patient.
- The DB constraint prevents duplicates even if application logic is bypassed.

---

## R4-06 — N+1 query problem in nudge cron

**Severity:** 🟠 High
**File:** `apps/web/app/api/cron/nudge/route.ts`

**Problem:**
For each candidate patient, the nudge cron makes **3 sequential Supabase
queries**:
1. Recent messages (last 3 days)
2. Last user message timestamp
3. Last metric row

With 100 patients this is 300 DB round-trips inside `Promise.allSettled`.
Even with connection pooling this is wasteful and slow.

**Action:**
1. Batch-fetch last message timestamps for all candidate patients in a
   single query using a Postgres function or view:
   ```sql
   SELECT patient_id, MAX(created_at) AS last_msg_at
   FROM messages
   WHERE role = 'user'
   GROUP BY patient_id;
   ```
2. Batch-fetch last metrics similarly.
3. Filter in JS using the pre-fetched maps, reducing queries from 3N to 2.

**Acceptance:**
- Nudge cron executes at most 4-5 total DB queries regardless of patient count.
- Processing time for 100 patients drops by >50%.

---

## R4-07 — `checkCostAlert` is dead code (never called)

**Severity:** 🟡 Medium
**File:** `apps/web/lib/sms/cost-tracker.ts`

**Problem:**
`checkCostAlert()` is exported and has an `ALERT_THRESHOLD = 40` constant,
but it is never called anywhere in the codebase. No alerting mechanism exists.
If costs exceed $40/month, nobody is notified.

**Action:**
Either:
- **(a)** Wire it into `trackSMSUsage` or the cron endpoints to log a warning
  or send an admin notification when the threshold is crossed.
- **(b)** Remove the dead code and add a `// TODO: S5 — implement cost alerting`
  ticket if it's planned for later.

**Acceptance:**
- If option (a): exceeding $40 triggers a console.error with `[ALERT]` prefix
  and/or calls a webhook. Test confirms alert fires at threshold.
- If option (b): dead code removed, ticket created.

---

## R4-08 — `.env.example` missing S4 environment variables

**Severity:** 🟡 Medium
**File:** `.env.example`

**Problem:**
Sprint 4 introduces three new required env vars that are absent from
`.env.example`:
- `REPORT_TOKEN_SECRET` (used by `generate-report.ts` and report page)
- `CRON_SECRET` (used by both cron endpoints)
- `ADMIN_API_KEY` (used by `GET /api/admin/sms-usage`)

New developers or CI pipelines will fail silently or throw opaque errors.

**Action:**
Add all three to `.env.example` with placeholder values and descriptions:

```bash
# Weekly report JWT signing key (min 32 chars)
REPORT_TOKEN_SECRET=change-me-to-a-random-secret-at-least-32-chars

# Vercel Cron authentication (auto-set by Vercel in production)
CRON_SECRET=local-dev-cron-secret

# Admin API key for /api/admin/* endpoints
ADMIN_API_KEY=local-dev-admin-key
```

**Acceptance:**
- `.env.example` documents every env var the app needs.
- `grep -c 'REPORT_TOKEN_SECRET\|CRON_SECRET\|ADMIN_API_KEY' .env.example`
  returns 3.

---

## R4-09 — Tests validate re-implemented logic, not actual source code

**Severity:** 🟡 Medium
**Files:**
- `apps/web/__tests__/cron-auth.test.ts`
- `apps/web/__tests__/nudge-eligibility.test.ts`
- `apps/web/__tests__/sms-cost-tracker.test.ts`
- `packages/ai-core/src/__tests__/generate-report.test.ts`
- `packages/ai-core/src/__tests__/pattern-detection.test.ts`

**Problem:**
Every test file re-implements the business logic inside the test file itself
(e.g., `verifyCronAuth` is defined in the test, not imported from the route).
This means:

- Tests can pass while the actual production code is broken.
- Any bug fix in the source code does not affect the test, so the test remains
  green even if the fix introduced a regression.
- Logic drift between test doubles and real code accumulates silently.

**Action:**
1. Extract shared pure functions from route handlers into importable modules:
   - `lib/auth/verify-cron.ts` for `verifyCronAuth`
   - `lib/nudge/eligibility.ts` for `isNudgeEligible`
2. Import and test the real functions, not re-implementations.
3. For functions that require Supabase or AI calls, mock only the external
   dependencies (Supabase client, `generateText`), not the entire function
   under test.

**Acceptance:**
- Zero functions are re-defined in test files.
- Every test imports from `src/` or `lib/` paths.
- Breaking a function in source causes at least one test to fail.

---

## R4-10 — Pattern detection loads unbounded metric history

**Severity:** 🟡 Medium
**File:** `packages/ai-core/src/tools/pattern-detection.ts`

**Problem:**
`detectPatterns` queries ALL metrics for a patient (`supabase.from('metrics').select(...)`)
with no `.limit()` or date range. For patients with 6+ months of data this
could return thousands of rows. The code then only uses the last 28 days
for the AI prompt (`.slice(-28)`), wasting bandwidth and memory on the rest.

**Action:**
1. Add a date range filter to the query — only fetch the last 60 days
   (enough for 14-day minimum + previous-period comparison):
   ```typescript
   const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
   .gte('recorded_at', sixtyDaysAgo.toISOString())
   ```
2. If full-history is ever needed for trend analysis, paginate or use a
   Postgres aggregate function.

**Acceptance:**
- Query returns at most ~60 days of data.
- Function still produces correct insights for patients with exactly
  14, 28, and 60+ days of data.

---

## R4-11 — Duplicate service-role client factories

**Severity:** 🟡 Medium
**Files:**
- `apps/web/lib/supabase/admin.ts` → `createAdminClient()`
- `apps/web/lib/supabase/server.ts` → `createServiceClient()`

**Problem:**
Two different factories create identical service-role Supabase clients. The
weekly report and nudge crons use `createAdminClient()`, while the report
page uses `createServiceClient()`. This is confusing — developers have to
guess which one to use, and both lack consistent env-var validation.

`createAdminClient` does a bare `if (!url || !serviceKey) throw` while
`createServiceClient` uses `requireEnv()` (with better error messages).

**Action:**
1. Delete `apps/web/lib/supabase/admin.ts`.
2. Use `createServiceClient()` everywhere (it already uses `requireEnv`
   for better DX).
3. Update imports in `nudge/route.ts` and `weekly-report/route.ts`.

**Acceptance:**
- One service-role client factory exists.
- All service-role usage goes through `createServiceClient()`.
- `grep -r 'createAdminClient' apps/` returns zero results.

---

## R4-12 — Report page missing caching, loading, and error states

**Severity:** 🟡 Medium
**File:** `apps/web/app/report/[token]/page.tsx`

**Problem:**
The report page is a Server Component that performs 3 DB queries on every
request (JWT verify, report load, metrics load). Issues:

1. **No caching:** Reports are immutable once generated, but the page
   re-queries the DB on every view. For a link shared via SMS and opened
   multiple times, this is wasteful.
2. **No `loading.tsx`:** Users see a blank page while data loads.
3. **No `error.tsx`:** Unhandled query failures produce a generic Next.js
   error page.

**Action:**
1. Add `export const revalidate = 3600` (1-hour static cache) or use
   `unstable_cache` / `use cache` for the data-fetching portion — report data
   is immutable per token.
2. Add `loading.tsx` with a skeleton UI.
3. Add `error.tsx` with a friendly error state that links to `/chat`.

**Acceptance:**
- Repeated visits to the same report URL result in cache hits (verify via
  `x-vercel-cache` header in production).
- `loading.tsx` and `error.tsx` exist and render correctly.

---

## R4-13 — Two separate SMS truncation systems

**Severity:** 🟡 Medium
**Files:**
- `apps/web/lib/sms/send.ts` → `formatSMSResponse()`
- `apps/web/app/api/cron/weekly-report/route.ts` → `buildSMSText()`

**Problem:**
Two completely different SMS-length-management functions exist:
- `formatSMSResponse` handles sentence-boundary truncation with "More at"
  suffix for general AI responses.
- `buildSMSText` handles progressive name-shortening for report notification
  SMS.

Both duplicate UCS-2 detection logic and segment limits. When Twilio pricing
or segment limits change, two places need updating.

**Action:**
1. Create a shared `lib/sms/format.ts` module with:
   - Shared constants (`GSM_SEGMENT_LIMIT`, `UCS2_SEGMENT_LIMIT`)
   - Shared `requiresUCS2()` (already in `send.ts`)
   - `truncateToSegmentLimit(text, encoding, maxSegments)` utility
2. Have both `formatSMSResponse` and `buildSMSText` delegate to the shared
   truncation utility.

**Acceptance:**
- `GSM_SEGMENT_LIMIT` and `UCS2_SEGMENT_LIMIT` are defined in exactly one
  file.
- `requiresUCS2` is imported (not duplicated).

---

## R4-14 — Report insert uses a placeholder token (two-step insert/update)

**Severity:** 🟡 Medium
**File:** `packages/ai-core/src/tools/generate-report.ts`

**Problem:**
The report is inserted with a `pending-...` placeholder token, then
immediately updated with the real signed JWT. This two-step write:
- Doubles the DB round-trips for report creation.
- Creates a window (however brief) where a row with an invalid token exists
  in the database.
- The placeholder token format (`pending-${patientId}-${weekStart}-${Date.now()}`)
  is predictable and could theoretically be guessed.

**Action:**
Generate the report UUID client-side (using `crypto.randomUUID()`) so the
token can be signed before the insert:

```typescript
const reportId = crypto.randomUUID()
const signedToken = await signReportToken(reportId, patientId)

const { data, error } = await supabase
  .from('reports')
  .insert({ id: reportId, token: signedToken, ... })
  .select()
  .single()
```

**Acceptance:**
- Report creation is a single INSERT (no subsequent UPDATE).
- No `pending-*` tokens ever exist in the database.

---

## R4-15 — "Open Chat" CTA has no auth context for SMS users

**Severity:** 🟡 Medium
**File:** `apps/web/app/report/[token]/page.tsx`

**Problem:**
The CTA button links to `/chat` with no patient identification. Patients
arriving from an SMS link are not authenticated in the web app. Clicking
"Open Chat" will likely redirect them to a login page or show an empty
chat with no patient context.

**Action:**
1. Append the patient identifier to the CTA URL:
   `/chat?token=<report-token>` or `/chat?patient=<patient-id>` (with
   appropriate auth handling on the chat page).
2. Or: generate a short-lived magic-link token that auto-authenticates
   the patient on the chat page.
3. At minimum: show the clinic phone number as an alternative CTA for
   SMS patients who can't use the web app.

**Acceptance:**
- Clicking "Open Chat" from a report page lands the user in an
  authenticated chat session (or a clear path to one).
- If web auth is not feasible, the CTA gracefully degrades to a
  "Reply to this number" message.

---

## R4-16 — Hardcoded colors instead of design tokens

**Severity:** 🟢 Low
**File:** `apps/web/app/report/[token]/page.tsx`

**Problem:**
The report page uses hardcoded hex colors throughout:
- `#0F766E` (teal — brand color)
- `#16A34A` (green — improving)
- `#DC2626` (red — worsening)
- `#F59E0B` (amber — discomfort)
- `#6B7280` (gray — stable)
- `#DCFCE7`, `#F0FDF4` (light green backgrounds)

These bypass the Tailwind theme and CSS custom properties. If the brand
palette changes, these inline styles won't update.

**Action:**
1. Define semantic color tokens in `tailwind.config.ts`:
   ```javascript
   colors: {
     brand: { DEFAULT: '#0F766E' },
     trend: { improving: '#16A34A', stable: '#6B7280', worsening: '#DC2626' },
     metric: { discomfort: '#F59E0B' },
   }
   ```
2. Replace inline `style={{ color: '#DC2626' }}` with Tailwind classes
   like `text-trend-worsening`.

**Acceptance:**
- Zero hardcoded hex colors in `page.tsx`.
- All colors reference Tailwind theme tokens.

---

## R4-17 — No `Suspense` boundary for client chart component

**Severity:** 🟢 Low
**File:** `apps/web/app/report/[token]/page.tsx`

**Problem:**
`DiscomfortChart` is a `'use client'` component using recharts (a heavy
client library). It's rendered inside a Server Component without a `Suspense`
boundary. This means:

- The entire page blocks on the chart bundle being ready.
- No fallback UI while recharts JS loads on the client.

**Action:**
Wrap the chart in a `Suspense` boundary with a skeleton fallback:

```tsx
import { Suspense } from 'react'

<Suspense fallback={<div className="h-40 animate-pulse rounded bg-muted" />}>
  <DiscomfortChart data={chartData} />
</Suspense>
```

**Acceptance:**
- A skeleton placeholder appears while the chart loads.
- Lighthouse performance score does not regress.

---

## R4-18 — Weekly report cron inefficient patient filtering

**Severity:** 🟢 Low
**File:** `apps/web/app/api/cron/weekly-report/route.ts`

**Problem:**
The cron first fetches ALL active patients, then runs a separate query on
the `metrics` table to find which patients have data this week, then filters
in JS. This is two queries + client-side set intersection.

**Action:**
Use a single query with a subquery or join:

```typescript
const { data: eligiblePatients } = await supabase
  .from('patients')
  .select('id, phone, name, language')
  .eq('active', true)
  .eq('opted_out', false)
  .in('id', supabase
    .from('metrics')
    .select('patient_id')
    .gte('recorded_at', weekStartISO)
  )
```

Or use a Postgres function that returns eligible patients directly.

**Acceptance:**
- Patient eligibility is determined in a single DB round-trip.
- Cron startup time decreases for clinics with many inactive patients.

---

## R4-19 — `jose` dependency duplicated in two packages

**Severity:** 🟢 Low
**Files:**
- `packages/ai-core/package.json` — `"jose": "^6.2.2"`
- `apps/web/package.json` — `"jose": "^6.2.2"`

**Problem:**
`jose` is listed in both `ai-core` and `web` packages. The report generation
(in `ai-core`) signs the JWT, and the report page (in `web`) verifies it.
While pnpm deduplicates this, the conceptual responsibility is split: `ai-core`
(an AI logic package) shouldn't be responsible for JWT signing — that's an
infrastructure concern.

**Action:**
1. Move `signReportToken` to `apps/web/lib/auth/report-token.ts`.
2. Remove `jose` from `packages/ai-core/package.json`.
3. Have `generateWeeklyReport` accept a `signToken` callback or return
   an unsigned report, letting the caller (cron route) handle signing.

**Acceptance:**
- `packages/ai-core/package.json` does not list `jose`.
- JWT signing logic lives in `apps/web`.

---

## R4-20 — Cron auth pattern is duplicated (not DRY)

**Severity:** 🟢 Low
**Files:**
- `apps/web/app/api/cron/weekly-report/route.ts` — `isAuthorized()`
- `apps/web/app/api/cron/nudge/route.ts` — inline auth check

**Problem:**
Both cron endpoints implement Bearer token verification independently.
The weekly report uses a helper function `isAuthorized(req)`, while the
nudge route does it inline. Neither uses constant-time comparison for the
secret, making them theoretically vulnerable to timing attacks (though the
practical risk is low given HTTPS + Vercel infrastructure).

**Action:**
1. Extract a shared `lib/auth/verify-cron.ts`:
   ```typescript
   import { timingSafeEqual } from 'crypto'

   export function verifyCronAuth(req: Request): boolean {
     const secret = process.env.CRON_SECRET
     if (!secret) return false
     const header = req.headers.get('authorization') ?? ''
     const token = header.replace('Bearer ', '')
     if (token.length !== secret.length) return false
     return timingSafeEqual(Buffer.from(token), Buffer.from(secret))
   }
   ```
2. Use it in both cron routes.

**Acceptance:**
- One auth function used by all cron endpoints.
- Uses `timingSafeEqual` for secret comparison.

---

## R4-21 — `sms_usage` table lacks `created_at` column

**Severity:** 🟢 Low
**File:** `supabase/migrations/007_add_sms_usage.sql`

**Problem:**
The `sms_usage` table has `updated_at` but no `created_at`. This makes it
hard to distinguish whether a month's first usage record was just created
or has been accumulating. Minor, but inconsistent with every other table
in the schema which has `created_at`.

**Action:**
Add `created_at timestamptz DEFAULT now()` to the table definition.

**Acceptance:**
- `sms_usage` has a `created_at` column.
- Schema matches the convention used by all other tables.

---

## R4-22 — `ai-core/src/index.ts` barrel file will conflict on merge

**Severity:** 🟢 Low
**File:** `packages/ai-core/src/index.ts`

**Problem:**
Three S4 branches modify `index.ts` to add their own exports:
- `feat/s4-weekly-report-generation` adds `generateWeeklyReport`
- `feat/s4-pattern-detection` adds `detectPatterns`
- The main branch still has the S3 version

These will produce merge conflicts. The changes are simple (appending export
lines) but still require manual resolution across 3 branches.

**Action:**
1. Establish a merge order for S4 branches (recommended:
   S401 → S402 → S403 → S404 → S405 → S406 → S407 → S408 → S409 → S410).
2. After the first merge, rebase remaining branches on the updated `main`.
3. Consider splitting barrel exports into domain-specific files
   (`index.ts` re-exports from `tools/index.ts`, `prompts/index.ts`, etc.)
   to reduce future merge conflicts.

**Acceptance:**
- All S4 branches merged without conflicts.
- `index.ts` exports all new symbols: `generateWeeklyReport`,
  `detectPatterns`.

---

## Merge Order Recommendation

To minimize conflicts and ensure each branch builds on its dependencies:

| Order | Branch | Depends on |
|-------|--------|-----------|
| 1 | `feat/s4-weekly-report-generation` (S401) | — |
| 2 | `feat/s4-report-page` (S402) | S401 |
| 3 | `feat/s4-weekly-report-cron` (S403) | S401, S402 |
| 4 | `feat/s4-inactivity-nudge` (S404) | — |
| 5 | `feat/s4-pattern-detection` (S405) | — |
| 6 | `feat/s4-progress-query` (S406) | — |
| 7 | `feat/s4-cron-config` (S407) | S403, S404 |
| 8 | `feat/s4-sms-cost-tracking` (S408) | — |
| 9 | `feat/s4-report-cta` (S409) | S402 |
| 10 | `feat/s4-tests` (S410) | all above |

**Renumber migration `007` before merging S404 and S408.**

---

## Quick Wins (can be done in a single PR)

- R4-08: Add missing env vars to `.env.example`
- R4-21: Add `created_at` to `sms_usage`
- R4-16: Replace hardcoded colors with Tailwind tokens
- R4-20: Extract shared cron auth helper
- R4-04: Unify `DEFAULT_MODEL` constant

## Must-Fix Before Production

- R4-01: Migration collision
- R4-02: Cost tracker race condition
- R4-03: Null-check AI structured output
- R4-05: Duplicate report guard
