# Code Review — Today's Commits on Main

**Reviewed:** 2026-04-03
**Period:** Last 24 hours
**Commits:** 28 (327a469..afb6991)
**Files changed:** 68
**Lines:** +7,205 / -457
**Reviewer:** Claude (Tech Lead)

---

## Executive Summary

A massive 28-commit push spanning Sprint 3 (SMS pipeline) and Sprint 4 (reports, crons, pattern detection). The architecture is generally sound — good separation of concerns, solid safety classification, proper Twilio signature validation, and idempotency guards. However, the volume of changes introduces several correctness bugs (double-saved messages, race conditions) and scalability concerns (N+1 queries in crons) that need attention before this sees real patient traffic.

---

## Critical (Must Fix)

### CRIT-1: Chat route double-saves user messages on emergency path
- **File:** `apps/web/app/api/chat/route.ts#L113-L175`
- **Commits:** `cf32c87`, `b4abc9f`
- **Issue:** The user message is saved to DB at line 113-122 (`insert...role: 'user'`). Then, on the emergency branch (line 174), it's inserted *again* as part of a bulk insert: `insert([{ role: 'user', content: currentMessageText }, { role: 'assistant', content: result.emergencyMessage }])`. Every emergency message gets duplicated in the `messages` table.
- **Impact:** Corrupted conversation history, inflated message counts, and potentially broken context windows for subsequent AI calls (the duplicate messages will be loaded by `buildContext`).
- **Suggested fix:** Remove the `{ role: 'user', ... }` entry from the bulk insert on line 174. The user message is already persisted at line 113.

### CRIT-2: SMS cost tracker has a read-then-write race condition
- **File:** `apps/web/lib/sms/cost-tracker.ts#L16-L44`
- **Commit:** `98f7d93`
- **Issue:** `trackSMSUsage()` performs a read (line 20-26), computes new totals (lines 30-31), then upserts (lines 33-43). Two concurrent SMS sends can read the same `segments` value and each overwrite with `old + 1`, losing an increment. The code comment acknowledges this but dismisses it as "low-frequency" — however, the nudge cron fires `Promise.allSettled` across all patients simultaneously, meaning concurrent sends are the norm during cron runs.
- **Impact:** Under-counted SMS costs, which defeats the purpose of the cost tracking feature (S408).
- **Suggested fix:** Use a Supabase RPC/database function with `UPDATE sms_usage SET segments = segments + $1, cost_estimate = cost_estimate + $2 WHERE month = $3` to make the increment atomic. Alternatively, use `ON CONFLICT ... DO UPDATE SET segments = sms_usage.segments + EXCLUDED.segments`.

### CRIT-3: Missing critical env vars in `.env.example`
- **File:** `.env.example`
- **Commits:** multiple
- **Issue:** Three security-critical environment variables are used in production code but not documented in `.env.example`:
  - `CRON_SECRET` (used in nudge + weekly-report crons for auth)
  - `REPORT_TOKEN_SECRET` (used for JWT signing of report tokens)
  - `ADMIN_API_KEY` (used for admin SMS usage endpoint)
- **Impact:** Anyone setting up the project (including CI) will get silent failures or 500s on these endpoints. The `REPORT_TOKEN_SECRET` missing will crash report generation with an unhandled throw.
- **Suggested fix:** Add all three to `.env.example` with placeholder values and comments.

---

## P1 (Should Fix Soon)

### P1-1: Nudge cron has 3N+1 database queries (N = patient count)
- **File:** `apps/web/app/api/cron/nudge/route.ts#L46-L136`
- **Commit:** `924ac7a`
- **Issue:** For each candidate patient, the handler runs 3 sequential queries inside `Promise.allSettled`: recent messages check (line 49-55), last message timestamp (line 62-68), and last metric (line 89-95). With 100 patients, that's 300+ queries per cron invocation — plus one AI call per eligible patient.
- **Impact:** Will hit `maxDuration = 60` timeout and/or Supabase connection limits as patient count grows. The `Promise.allSettled` wrapper means all patients' query chains run concurrently, amplifying connection pressure.
- **Suggested fix:** Batch the recency check into a single query: `SELECT patient_id, MAX(created_at) as last_message_at FROM messages WHERE role = 'user' GROUP BY patient_id`. Then filter in-memory. Reduces 2N queries to 1.

### P1-2: Admin API key comparison is not timing-safe
- **File:** `apps/web/app/api/admin/sms-usage/route.ts#L18`
- **Commit:** `98f7d93`
- **Issue:** `token !== adminKey` uses JavaScript's standard string comparison, which short-circuits on first mismatch. This leaks information about the key via response timing differences.
- **Impact:** Theoretical key recovery via timing side-channel. Low practical risk for an admin endpoint, but easy to fix and inconsistent with the timing-safe comparison used in `validate.ts`.
- **Suggested fix:** Use `timingSafeEqual` from `node:crypto`, same as in `validate.ts`.

### P1-3: Cron auth header comparison is not timing-safe
- **File:** `apps/web/app/api/cron/nudge/route.ts#L22`, `apps/web/app/api/cron/weekly-report/route.ts#L23`
- **Commits:** `924ac7a`, `3ddded3`
- **Issue:** Same as P1-2. `authHeader !== \`Bearer ${cronSecret}\`` is not constant-time.
- **Impact:** Same timing side-channel concern.
- **Suggested fix:** Extract a shared `verifyBearerToken(req, secret)` utility using `timingSafeEqual`.

### P1-4: Report page auth check is misleading for SMS recipients
- **File:** `apps/web/app/report/[token]/page.tsx#L284-L289`
- **Commit:** `cf32c87`
- **Issue:** The page calls `createClient()` (cookie-based auth) then checks `user` to decide the CTA destination (`/chat` vs `/login`). But this page is accessed via SMS links — recipients will never have a session cookie. The CTA will always show "Open Chat" pointing to `/login`, not `/chat`.
- **Impact:** Not a bug per se, but the auth client creation is unnecessary overhead on every page load, and the conditional logic is dead code that creates confusion for future maintainers.
- **Suggested fix:** Either always point to `/chat` (which can redirect to login itself via middleware) or remove the auth check entirely and always use `/chat`.

### P1-5: Weekly report cron has no concurrency limit on AI calls
- **File:** `apps/web/app/api/cron/weekly-report/route.ts#L154-L174`
- **Commit:** `3ddded3`
- **Issue:** `Promise.allSettled(eligiblePatients.map(...))` fires AI generation for ALL eligible patients simultaneously. Each `generateWeeklyReport` call invokes Claude (and potentially `detectPatterns` which makes a second Claude call). With 50 patients, that's 50-100 concurrent Anthropic API calls.
- **Impact:** Will hit Anthropic rate limits, causing cascading failures. Also pushes against `maxDuration = 300`.
- **Suggested fix:** Process patients in batches of 5-10 with a simple chunking loop, or use `p-limit` to cap concurrency.

---

## P2 (Nice to Fix)

### P2-1: Duplicated utility functions across AI tools
- **Files:** `packages/ai-core/src/tools/generate-report.ts`, `pattern-detection.ts`, `get-history.ts`
- **Issue:** `avg()`, `round1()`, `countExerciseDays()`, and `QueriedMetric` type are duplicated across three files.
- **Suggestion:** Extract to a shared `packages/ai-core/src/tools/utils.ts`.

### P2-2: In-memory rate limiter never evicts entries
- **File:** `apps/web/lib/sms/rate-limit.ts#L39`
- **Issue:** `memoryStore` Map grows unbounded in local dev. Old entries are filtered per-key on access but never removed from the Map itself.
- **Suggestion:** Add a periodic cleanup or use a TTL-aware Map. Low priority since this only affects local dev.

### P2-3: Onboarding `_languageSet` flag is fragile
- **File:** `apps/web/lib/sms/onboarding.ts#L84`
- **Issue:** Language step completion is tracked via a private `_languageSet` field in the profile JSON. If profile is ever overwritten without this field, the patient gets re-prompted. Also, the condition `patient.language === 'en'` means non-English default languages would skip this step entirely.
- **Suggestion:** Consider using a dedicated `onboarding_step` column or checking for the existence of the language field differently.

### P2-4: `exercise_count` field inconsistency
- **File:** `packages/ai-core/src/tools/log-metrics.ts#L55`
- **Issue:** `exercise_count` is derived from `exercises_done.length` inside the tool, but the tool's input schema doesn't expose `exercise_count` directly. Meanwhile, the `conversationTools` in `engine.ts#L63` *does* include `exercise_count` in its schema. This means the web chat's tool schema and the server-executed tool schema have different shapes.
- **Suggestion:** Align the schemas — either both include `exercise_count` or neither does (and derive it server-side).

---

## Positive Highlights

1. **Twilio signature validation is textbook-correct.** `validate.ts` uses HMAC-SHA1 with timing-safe comparison, and the webhook route properly handles `x-forwarded-host` for proxy scenarios. The idempotency check via `twilio_sid` is a smart guard against redelivery.

2. **Safety classification is well-designed.** The multi-layer approach (emergency > adversarial > medical advice > off-topic) with historical pain reference exclusion and pain proximity checks shows real thoughtfulness. The multi-turn analysis via `recentHistory` is a cheap but effective mitigation against split-message adversarial attacks.

3. **SMS formatting is production-quality.** The `formatSMSResponse` function handles UCS-2 encoding budgets for Chinese text, truncates at sentence boundaries, and gracefully degrades. The `buildSMSText` in weekly-report does progressive name shortening to fit within segment limits. This level of attention to SMS delivery costs is impressive.

4. **The server-executed tool pattern is clean.** Using factory functions (`createLogMetricsTool`, `createGetHistoryTool`) to close over Supabase client + patient context avoids the need for global state or request-scoped DI containers. Well-documented rationale in the JSDoc.

---

## Test Coverage Assessment

| File | Has Tests | Coverage | Gaps |
|------|-----------|----------|------|
| `lib/sms/validate.ts` | Yes (`sms-validate.test.ts`) | Good | - |
| `lib/sms/send.ts` | Yes (`sms-send.test.ts`) | Partial | No test for `formatSMSResponse` UCS-2 path |
| `lib/sms/rate-limit.ts` | Yes (`sms-rate-limit.test.ts`) | Partial | Only in-memory path tested |
| `lib/sms/keywords.ts` | Yes (`sms-keyword.test.ts`) | Good | - |
| `lib/sms/cost-tracker.ts` | Yes (`sms-cost-tracker.test.ts`) | Partial | Race condition not tested |
| `api/cron/nudge/route.ts` | Yes (`nudge-eligibility.test.ts`) | Good | - |
| `api/cron/weekly-report/route.ts` | Yes (`report-token.test.ts`) | Partial | Only token verification tested |
| `ai-core/src/safety.ts` | Yes (`safety.test.ts`) | Good | - |
| `ai-core/src/tools/generate-report.ts` | Yes (`generate-report.test.ts`) | Good | - |
| `ai-core/src/tools/pattern-detection.ts` | Yes (`pattern-detection.test.ts`) | Good | - |
| `api/chat/route.ts` | No | None | No integration tests for chat endpoint |
| `api/sms/route.ts` | No | None | No integration tests for SMS webhook |
| `lib/sms/onboarding.ts` | No | None | Stateful onboarding flow untested |
| `lib/sms/mms.ts` | No | None | MMS download/upload untested |
| `app/report/[token]/page.tsx` | No | None | Report page rendering untested |

---

## Commit Message Quality

| Commit | Message | Rating |
|--------|---------|--------|
| `afb6991` | "fix: update supabase config.toml for CLI v2.84 compatibility" | Good |
| `b4abc9f` | "fix: rename duplicate migration 007->008 and wire pattern detection into reports" | Good — two changes in one commit though |
| `3ae86b9` | "S410: Sprint 4 test suite (#18)" | Good |
| `9ed889b` | "S407: Vercel Cron configuration (#17)" | Good |
| `3ddded3` | "S403: Weekly report SMS delivery via Vercel Cron (#16)" | Good |
| `01c246f` | "fix: resolve S3 code review - 22 issues across SMS/Twilio pipeline" | Good — bulk fix commit |
| `835409f` | "fix: resolve S2 code review - 28 fixes across security, safety, UX, and infra" | Needs improvement — 28 fixes in one commit is too large to bisect |

---

## Action Items

- [ ] **CRITICAL:** Fix double user message insertion on emergency path in `chat/route.ts` — owner: eng
- [ ] **CRITICAL:** Make SMS cost tracking atomic (DB-level increment) — owner: eng
- [ ] **CRITICAL:** Add `CRON_SECRET`, `REPORT_TOKEN_SECRET`, `ADMIN_API_KEY` to `.env.example` — owner: eng
- [ ] **P1:** Batch nudge cron DB queries to reduce from 3N to ~3 queries — owner: eng
- [ ] **P1:** Use timing-safe comparison for admin/cron auth — owner: eng
- [ ] **P1:** Add concurrency limit to weekly report AI calls — owner: eng
- [ ] **P1:** Remove or simplify report page auth check — owner: eng
- [ ] **P2:** Extract shared metric utilities to `tools/utils.ts`
- [ ] **P2:** Add memory eviction to dev rate limiter
- [ ] **P2:** Align `exercise_count` across tool schemas
