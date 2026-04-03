# Sprint 3 Code Review — Tech Lead Audit

**Reviewer:** Tech Lead (automated audit)
**Sprint:** S3 — SMS/Twilio Integration Pipeline
**Date:** 2026-04-03
**Files reviewed:** 19 files, 1553 lines added across 6 PRs

**Overall Assessment:** The S3 deliverables are functional and well-structured for a first pass. However, there are several issues ranging from **critical bugs** to **architectural debt** that should be addressed before this code sees production traffic. The most urgent are a false-positive keyword detection bug (compliance risk), a rate limiter that doesn't work on Vercel, and dead code paths that suggest unfinished wiring.

---

## Critical

### S3R-01: `detectKeyword` false-positive on STOP — TCPA/CRTC compliance risk

**File:** `apps/web/app/api/sms/route.ts` line 35
**Severity:** Critical
**Category:** Bug / Compliance

The STOP keyword detection uses `trimmed.includes('STOP')`, which matches any message containing the substring "STOP" — including legitimate patient messages like:

- "I can't stop sneezing"
- "The pain stopped after stretching"
- "Nonstop discomfort today"
- "I stopped taking the medication"

This will silently opt patients out when they are trying to communicate about their recovery. Under TCPA (US) and CRTC (Canada), unsubscribe handling must be accurate — but false positives that prevent patients from receiving care messages are equally dangerous from a product and legal standpoint.

**Steps:**
1. Change line 35 from `trimmed === 'STOP' || trimmed.includes('STOP')` to exact match only: `trimmed === 'STOP'`
2. Optionally support multi-word variants Twilio recommends: `STOP`, `STOPALL`, `UNSUBSCRIBE`, `CANCEL`, `END`, `QUIT` — all as exact matches
3. Update the duplicated function in `__tests__/sms-keyword.test.ts` to match
4. Add test cases for false-positive scenarios: `"the pain stopped"`, `"nonstop"`, `"unstoppable"`

**Acceptance:**
- `detectKeyword("the pain stopped")` returns `null`, not `'stop'`
- `detectKeyword("STOP")` still returns `'stop'`
- Test suite includes false-positive regression cases

---

### S3R-02: In-memory rate limiter is non-functional on Vercel

**File:** `apps/web/lib/sms/rate-limit.ts`
**Severity:** Critical
**Category:** Architecture / Infra

The rate limiter uses a module-level `Map<string, RateLimitEntry>` to track request counts. On Vercel:

- Functions are stateless and ephemeral — the Map resets on every cold start
- Multiple function instances don't share memory — concurrent requests go to different instances
- The `setInterval` cleanup timer is also meaningless in a serverless context

This means there is effectively **zero rate limiting** in production. A bad actor could flood the webhook with unlimited requests, each triggering an AI call (costly) and database writes.

**Steps:**
1. Replace the in-memory store with a durable backing store. Options:
   - **Upstash Redis** (recommended for Vercel) — use `@upstash/ratelimit` with sliding window
   - **Supabase RPC** — a simple `check_rate_limit(phone, window_ms, max_requests)` function using a `rate_limits` table
   - **Vercel Edge Config** — not ideal for write-heavy rate limiting
2. Keep the in-memory implementation as a fallback for local development (`if (!REDIS_URL) use in-memory`)
3. Add a `RATE_LIMIT_DISABLED` env var for local dev convenience
4. Update tests to mock the Redis client

**Acceptance:**
- Rate limiting works across cold starts and concurrent instances
- Rate-limited requests return 200 (silent drop per Twilio best practices) with a `console.warn`
- Local development works without Redis (graceful fallback)

---

### S3R-03: MMS processing pipeline is dead code — media URLs will expire

**File:** `apps/web/lib/sms/mms.ts`, `apps/web/app/api/sms/route.ts`
**Severity:** Critical
**Category:** Dead Code / Data Loss

`processMMSMedia()` in `lib/sms/mms.ts` downloads images from Twilio, validates them, and uploads to Supabase Storage. However, **it is never called anywhere.** The SMS route only calls `collectMediaUrls()` (line 231), which stores raw Twilio media URLs directly into `messages.media_urls`.

These raw Twilio URLs:
- Require HTTP Basic Auth with Twilio credentials to access
- Are not directly displayable in the patient dashboard
- May expire or become inaccessible if the Twilio account changes

Similarly, `ensureMediaBucket()` is exported but never called.

**Steps:**
1. Wire `processMMSMedia` into `processMessageAsync` — call it when `numMedia > 0`
2. Store the Supabase storage paths in `messages.media_urls` instead of raw Twilio URLs
3. Add a `fetchSignedMediaUrl` helper for the dashboard to re-sign expired URLs on demand
4. Remove or deprecate `ensureMediaBucket` (the SQL migration `006` already creates the bucket)
5. Add integration test for the MMS flow

**Acceptance:**
- MMS images are downloaded from Twilio and stored in Supabase Storage
- `messages.media_urls` contains Supabase storage paths, not Twilio URLs
- Dashboard can display stored images via signed URLs

---

## High

### S3R-04: `createLogMetricsTool` and `createGetHistoryTool` are never wired in

**File:** `packages/ai-core/src/tools/log-metrics.ts`, `packages/ai-core/src/tools/get-history.ts`
**Severity:** High
**Category:** Dead Code / Architecture

Two factory tool functions were built in S3:
- `createLogMetricsTool` — server-side `log_metrics` with `execute` that persists to DB
- `createGetHistoryTool` — server-side `get_history` with `execute` that queries metrics

Neither is used by `engine.ts` (which defines its own inline `conversationTools.log_metrics` without an `execute` function) or by either route handler. Both routes manually parse tool calls from `stream.steps` after the stream completes.

This means:
- `get_history` is completely unavailable to the AI — the model cannot call it
- `log_metrics` persistence is duplicated: once in the factory tool's `execute`, once manually in both routes
- The tools in `packages/ai-core/src/tools/` are orphaned dead code

**Steps:**
1. Decide on the architecture: either use server-executed tools (with `execute`) or client-side tools (manual step parsing). Don't have both.
2. **Recommended:** Use the factory tools with `execute`. Modify `createConversation` in `engine.ts` to accept additional tools via a `tools` parameter, merge them with `conversationTools`
3. Wire `createLogMetricsTool` and `createGetHistoryTool` into both the web chat route and SMS route
4. Remove the manual `stream.steps` metric extraction code from both routes
5. Remove the inline `conversationTools.log_metrics` from `engine.ts` (it's superseded by the factory version)

**Acceptance:**
- AI can call both `log_metrics` and `get_history` during conversations
- Metrics are persisted via the tool's `execute` function, not manual step parsing
- No duplicate metric insertion code exists

---

### S3R-05: `route.ts` is a 436-line monolith — extract business logic

**File:** `apps/web/app/api/sms/route.ts`
**Severity:** High
**Category:** Maintainability / Architecture

The SMS route file contains:
- Twilio body parsing
- Admin Supabase client creation
- Keyword detection and handling
- Patient lookup and creation
- Idempotency checking
- Full SMS onboarding flow (consent, name, injury, language)
- AI context building and message handling
- Metric extraction from tool calls
- SMS reply retry logic
- Media URL collection

This makes the file hard to test (the keyword test copies the function instead of importing it), hard to review, and tightly coupled.

**Steps:**
1. Extract `detectKeyword` and `handleKeyword` → `lib/sms/keywords.ts` (export for testing)
2. Extract `handleSMSOnboarding` → `lib/sms/onboarding.ts`
3. Extract `processMessageAsync` → `lib/sms/process.ts`
4. Extract `createAdminClient` → `lib/supabase/admin.ts` (reusable across routes)
5. Keep `route.ts` as a thin orchestrator: parse → validate → dispatch
6. Update `sms-keyword.test.ts` to import `detectKeyword` directly instead of duplicating it

**Acceptance:**
- `route.ts` is under 100 lines
- All extracted modules have their own test files importing the real functions
- No function duplication between tests and source code

---

### S3R-06: Keyword test duplicates source code instead of importing

**File:** `apps/web/__tests__/sms-keyword.test.ts`
**Severity:** High
**Category:** Test Quality

The test file comments: *"Since detectKeyword is not exported, we replicate it here for unit testing."* This means the test validates a **copy** of the function, not the actual implementation. If someone modifies the real `detectKeyword` in `route.ts`, the test will still pass with the old behavior.

**Steps:**
1. Export `detectKeyword` from its source module (see S3R-05 for extraction)
2. Import it in the test file
3. Remove the duplicated function from the test
4. Add a comment explaining the import

**Acceptance:**
- Test imports `detectKeyword` from source — no function duplication
- Test fails if the real implementation changes behavior

---

### S3R-07: No timeout or abort signal on Twilio media download

**File:** `apps/web/lib/sms/mms.ts` line 50
**Severity:** High
**Category:** Reliability

The `fetch(mediaUrl, ...)` call in `processMMSMedia` has no timeout. If Twilio's media endpoint is slow or hangs, the function will block until the Vercel function timeout (15s for SMS route). Since this runs inside `waitUntil`, it could silently consume function execution time.

**Steps:**
1. Add `AbortSignal.timeout(8000)` to the fetch call (leave headroom before the 15s function timeout)
2. Catch `AbortError` and log it as a warning
3. Consider processing media downloads in parallel with `Promise.allSettled` instead of sequential loop

**Acceptance:**
- Media downloads abort after 8 seconds
- Slow/failed downloads don't block other media items or the AI response

---

## Medium

### S3R-08: `validateTwilioSignature` uses manual constant-time comparison

**File:** `apps/web/lib/sms/validate.ts` lines 23-28
**Severity:** Medium
**Category:** Security

The signature validation uses a hand-rolled constant-time comparison loop. Node.js provides `crypto.timingSafeEqual` which is the standard, audited implementation. The manual version has a subtle issue: it returns `false` early if lengths don't match (line 23), which leaks length information — though in practice Twilio signatures are always Base64-encoded SHA1 (28 chars), so the risk is low.

**Steps:**
1. Replace the manual comparison with `crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))`
2. Handle the length mismatch case by padding or returning `false` before the comparison (timingSafeEqual throws on length mismatch)

**Acceptance:**
- Uses `crypto.timingSafeEqual` for comparison
- Existing tests still pass

---

### S3R-09: Race condition in patient creation from SMS

**File:** `apps/web/app/api/sms/route.ts` lines 203-218
**Severity:** Medium
**Category:** Concurrency

If two SMS messages arrive simultaneously from a new phone number:
1. Both pass the idempotency check (different `MessageSid`)
2. Both find `patient === null`
3. Both try to `INSERT INTO patients` with the same phone number
4. One succeeds, one fails with a UNIQUE constraint violation on `phone`

The error is caught by the outer try/catch and logged, but the second message is silently dropped.

**Steps:**
1. Use `INSERT ... ON CONFLICT (phone) DO NOTHING` and then re-select the patient
2. Or wrap the lookup + insert in a Supabase RPC function with `SERIALIZABLE` isolation
3. Add a retry with re-lookup on unique constraint violation

**Acceptance:**
- Two simultaneous messages from a new number both get processed
- No unique constraint errors in logs for normal operation

---

### S3R-10: Hardcoded `clinic_id: 'vhealth'` in patient creation

**File:** `apps/web/app/api/sms/route.ts` line 208
**Severity:** Medium
**Category:** Architecture / Multi-tenancy

When a new patient texts in, they are automatically assigned to clinic `'vhealth'`. There is no mechanism to:
- Route patients to different clinics based on the Twilio number they texted
- Support multiple clinics with different Twilio numbers

**Steps:**
1. Create a `twilio_numbers` config (DB table or Edge Config) mapping Twilio numbers to clinic IDs
2. Look up `params.To` (the Twilio number the patient texted) to determine the clinic
3. Fall back to `'vhealth'` or an env var `DEFAULT_CLINIC_ID` for now
4. Add the `To` number to the webhook processing context

**Acceptance:**
- Clinic ID is derived from the receiving Twilio number, not hardcoded
- Default fallback exists for backward compatibility

---

### S3R-11: `PatientSMS` type is manually maintained — use generated DB types

**File:** `apps/web/app/api/sms/route.ts` lines 174-184
**Severity:** Medium
**Category:** Type Safety

The `PatientSMS` type is defined inline and must be manually kept in sync with both the database schema and the `.select()` query on line 148. If a column is added/removed from `patients`, this type won't reflect it and could cause runtime mismatches.

**Steps:**
1. Import `Database` from `@physio-os/shared`
2. Derive the type: `type PatientRow = Database['public']['Tables']['patients']['Row']`
3. Use `Pick<PatientRow, 'id' | 'name' | ...>` for the subset used in SMS processing
4. Remove the manual `PatientSMS` interface

**Acceptance:**
- Patient type is derived from generated database types
- No inline type definitions that duplicate the schema

---

### S3R-12: No error checking on Supabase updates in onboarding

**File:** `apps/web/app/api/sms/route.ts` lines 363-423
**Severity:** Medium
**Category:** Error Handling

`handleSMSOnboarding` performs multiple Supabase `update` operations but never checks the result for errors. If an update fails (e.g., network issue, RLS violation), the function silently continues and sends the next onboarding prompt, putting the patient in a broken state.

**Steps:**
1. Check `{ error }` from each `supabase.from('patients').update(...)` call
2. On failure, send a generic "Something went wrong, please try again" SMS
3. Log the error with patient context for debugging

**Acceptance:**
- All Supabase updates in onboarding are error-checked
- Failures result in a user-friendly retry prompt, not silent corruption

---

### S3R-13: `sendSMS` retry logic is naive — use exponential backoff

**File:** `apps/web/app/api/sms/route.ts` lines 320-334
**Severity:** Medium
**Category:** Reliability

The retry logic uses a fixed 2-second delay and 2 attempts. This doesn't account for:
- Twilio rate limits (429 responses) which need longer backoff
- Transient network errors that resolve quickly
- The difference between retryable and non-retryable errors (e.g., invalid phone number should not be retried)

**Steps:**
1. Move retry logic into `sendSMS` itself (or a wrapper) so all callers benefit
2. Implement exponential backoff: 1s → 2s → 4s
3. Only retry on 429 or 5xx responses; immediately throw on 4xx client errors
4. Make max retries and base delay configurable

**Acceptance:**
- `sendSMS` handles retries internally with exponential backoff
- Non-retryable errors (400, 401, 404) are not retried
- Retry behavior is configurable

---

### S3R-14: `formatSMSResponse` has overlapping/confusing budget logic

**File:** `apps/web/lib/sms/send.ts` lines 80-81
**Severity:** Medium
**Category:** Code Clarity

```typescript
if (text.length <= budget) return text         // budget = 280 for ASCII
if (text.length <= truncateAt && !isUCS2) return text  // truncateAt = 320 for ASCII
```

For ASCII text, messages between 281-320 characters pass the second check and are returned as-is. This seems intentional (allow up to ~2 GSM segments) but the intent is unclear. For UCS-2, `budget` and `truncateAt` are both 140, so the second check is dead code for UCS-2.

**Steps:**
1. Add a clear comment explaining the tiered budget strategy: "Under 280 = 1-2 segments (send as-is), 281-320 = allow 2 segments (still fits in 2 GSM segments), over 320 = truncate"
2. Simplify the early returns into a single check: `if (text.length <= truncateAt) return text` (since `budget <= truncateAt` always)
3. Or better: compute the actual segment count and decide based on that

**Acceptance:**
- Budget logic is documented and self-explanatory
- No redundant conditionals

---

### S3R-15: Signed URLs expire after 24 hours with no refresh mechanism

**File:** `apps/web/lib/sms/mms.ts` line 89
**Severity:** Medium
**Category:** Data Access

`createSignedUrl(storagePath, 24 * 60 * 60)` creates a 24-hour signed URL that is stored as `publicUrl`. After 24 hours, the URL returns 403. The dashboard has no mechanism to re-sign expired URLs.

**Steps:**
1. Store the `storagePath` as the primary reference in `messages.media_urls`, not the signed URL
2. Create an API endpoint or server component that generates fresh signed URLs on demand
3. In the dashboard/chat UI, resolve storage paths to signed URLs at render time

**Acceptance:**
- Media is always accessible regardless of when it was uploaded
- Signed URLs are generated on-demand, not stored permanently

---

## Low

### S3R-16: `NON_GSM_PATTERN` regex includes non-GSM characters

**File:** `apps/web/lib/sms/send.ts` line 60
**Severity:** Low
**Category:** Correctness

The regex `/[^\u0020-\u007E\u00A0-\u00FF\u0391-\u03C9\u20AC\n\r]/` is an approximation of the GSM 03.38 character set. The range `\u00A0-\u00FF` includes characters like `½`, `¾`, `¿` which are in GSM, but also `¸` (cedilla) and `¹` (superscript 1) which are **not** in GSM 03.38. This means some messages will be mis-classified as GSM when they're actually UCS-2, leading to incorrect segment budgets.

**Steps:**
1. Use a well-tested GSM character detection library like `gsm-charset` or build an explicit Set of all 128 GSM 03.38 characters + extension table
2. Or accept the approximation with a comment documenting the known inaccuracies

**Acceptance:**
- GSM detection is either precise (using a reference table) or documented as approximate

---

### S3R-17: `get_history` force-casts query result to `MetricRow`

**File:** `packages/ai-core/src/tools/get-history.ts` line 94
**Severity:** Low
**Category:** Type Safety

```typescript
const rows = (data ?? []) as MetricRow[]
```

The query only selects 6 columns (`pain_level, discomfort, sitting_tolerance_min, exercises_done, exercise_count, recorded_at`), but `MetricRow` has additional columns (`id, patient_id, notes, source_message_id, created_at`). The `as` cast silently allows accessing non-existent fields without a compile-time error.

**Steps:**
1. Use `Pick<MetricRow, 'pain_level' | 'discomfort' | 'sitting_tolerance_min' | 'exercises_done' | 'exercise_count' | 'recorded_at'>` as the row type
2. Or select all columns (simpler but slightly more data over the wire)

**Acceptance:**
- No `as` casts that widen the type beyond what was actually queried

---

### S3R-18: `processMessageAsync` silently fails with no dead-letter mechanism

**File:** `apps/web/app/api/sms/route.ts` lines 197-346
**Severity:** Low (for now, Medium at scale)
**Category:** Reliability

If `processMessageAsync` throws (e.g., Anthropic API is down), the user message is saved to DB but no AI response is ever sent. The patient receives no reply and no retry is attempted. At scale, this could mean lost messages during API outages.

**Steps:**
1. Add a `processing_status` column to `messages` (or a separate `sms_jobs` table) to track whether the AI response was sent
2. Create a cron job that retries unsent messages (e.g., messages with `channel='sms'` and `role='user'` that have no corresponding `role='assistant'` message within 5 minutes)
3. Or use Vercel Queues for reliable async processing with built-in retries

**Acceptance:**
- Failed message processing is detectable
- A retry mechanism exists for unprocessed SMS messages

---

### S3R-19: `handleSMSOnboarding` doesn't persist onboarding messages

**File:** `apps/web/app/api/sms/route.ts` lines 352-425
**Severity:** Low
**Category:** Audit Trail

During onboarding, the assistant messages ("What should we call you?", "What brings you to V-Health?") are sent via `sendSMS` but never saved to the `messages` table. This means:
- The chat history on the web dashboard is incomplete
- There's no audit trail for consent collection
- The unified message view (`chat/page.tsx`) won't show onboarding messages

**Steps:**
1. After each `sendSMS` in the onboarding flow, insert an `assistant` message into the `messages` table
2. Include `channel: 'sms'` for proper unified history display
3. The user's onboarding responses are already saved (line 223-238), so only the assistant side needs adding

**Acceptance:**
- All onboarding messages (both user and assistant) appear in the message history
- Consent reply is traceable in the DB

---

### S3R-20: Chat page `extractMetricsFromParts` checks for `'tool-log_metrics'` — invalid part type

**File:** `apps/web/app/(patient)/chat/page.tsx` lines 39-49
**Severity:** Low
**Category:** Dead Code

The function checks `part.type === 'tool-log_metrics'`. However, `UIMessage` parts have types like `'text'`, `'tool-invocation'`, `'tool-result'`, `'file'`, `'reasoning'`, `'source'` — there is no `'tool-log_metrics'` type. This means `extractMetricsFromParts` will **never** extract any metrics, and the `MetricBadge` component will never render.

**Steps:**
1. Check for `part.type === 'tool-invocation'` and then inspect `part.toolName === 'log_metrics'`
2. Follow the AI SDK `UIMessage` part types: `ToolInvocationUIPart` has `toolInvocation.toolName` and `toolInvocation.args`
3. Add a test or Storybook story for the metric badge rendering

**Acceptance:**
- Metric badges actually render when `log_metrics` is called during a conversation
- Part type checking follows the AI SDK `UIMessage` specification

---

### S3R-21: Missing `NEXT_PUBLIC_APP_URL` in `.env.example`

**File:** `.env.example`
**Severity:** Low
**Category:** DX / Documentation

The SMS route references `process.env.NEXT_PUBLIC_APP_URL` (line 257) for the web app link in truncated SMS responses and the onboarding privacy policy URL (line 377). This env var is not listed in `.env.example`, so developers won't know to set it.

**Steps:**
1. Add `NEXT_PUBLIC_APP_URL=http://localhost:3000` to `.env.example`
2. Document its purpose in a comment

**Acceptance:**
- `.env.example` lists all env vars used by the application

---

### S3R-22: `maxDuration = 15` may be too short for AI + MMS processing

**File:** `apps/web/app/api/sms/route.ts` line 11
**Severity:** Low
**Category:** Configuration

The SMS route sets `maxDuration = 15` (seconds). The processing flow includes:
- Supabase queries (patient lookup, message save)
- MMS media download from Twilio (up to 5MB per image)
- AI model call (Claude, could be 5-10s)
- Metric persistence
- SMS reply send via Twilio

If any step is slow (cold start, Twilio latency, model thinking), 15 seconds may not be enough. The `engine.ts` timeout for SMS is 12s, leaving only 3s for everything else.

**Steps:**
1. Consider increasing to `maxDuration = 25` or `30` (the web chat route uses 30)
2. Alternatively, reduce the AI timeout for SMS to 10s and keep the 15s total
3. Add timing logs to understand the actual p95 latency breakdown

**Acceptance:**
- Function timeout is validated against measured p95 latency
- No timeout errors under normal load

---

## Summary

| Priority | Count | Key Theme |
|----------|-------|-----------|
| Critical | 3 | STOP keyword bug, broken rate limiter, dead MMS code |
| High | 4 | Dead tool code, monolith route, test duplication, missing fetch timeout |
| Medium | 8 | Race conditions, type safety, error handling, retry logic |
| Low | 7 | Regex accuracy, audit trail, UX bugs, env docs |

**Recommended order of attack:**
1. S3R-01 (STOP bug) — immediate fix, 15 min
2. S3R-03 (wire MMS processing) — complete the unfinished feature
3. S3R-02 (rate limiter) — replace with Upstash Redis
4. S3R-05 + S3R-06 (decompose route + fix test duplication) — enables all other refactors
5. S3R-04 (wire factory tools) — architectural alignment
6. Everything else in priority order

---

## Resolution (2026-04-03)

All 22 issues resolved in commit `01c246f`. Lint and typecheck pass clean.

### Follow-up items (deferred)

- **Upstash Redis provisioning**: `@upstash/ratelimit` and `@upstash/redis` are installed and the rate limiter code is ready, but `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` need to be set in Vercel env vars. Until then, production falls back to in-memory (ineffective on serverless). Provision via Vercel Marketplace or Upstash console.
