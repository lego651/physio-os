# Security Audit — S605

**Date:** 2026-04-03
**Auditor:** Tech Lead (automated review + manual inspection)
**Scope:** All API routes and token-gated pages in `apps/web`

---

## Route Audit Table

| Route | Method | Auth | Rate Limit | Input Validation | Twilio Sig | Status |
|---|---|---|---|---|---|---|
| `/api/chat` | POST | Supabase session (patient) | 20/hr per patient (added) | Zod schema, max 5000 chars | N/A | Fixed |
| `/api/sms` | POST | Twilio signature | 10/hr per phone (Upstash/mem) | Required fields, phone normalisation | Yes (HMAC-SHA1, timing-safe) | Pass |
| `/api/cron/nudge` | GET | `CRON_SECRET` Bearer (timing-safe) | N/A | N/A | N/A | Pass |
| `/api/cron/weekly-report` | GET | `CRON_SECRET` Bearer (timing-safe) | N/A | N/A | N/A | Pass |
| `/api/admin/patients` | POST | Supabase session + `ADMIN_EMAIL` | N/A | name, phone (E.164), language | N/A | Pass |
| `/api/admin/patients/[id]` | PATCH | Supabase session + `ADMIN_EMAIL` | N/A | UUID, field-level types | N/A | Pass |
| `/api/admin/patients/[id]/messages` | GET | Supabase session + `ADMIN_EMAIL` | N/A | UUID, limit clamped (fixed NaN) | N/A | Fixed |
| `/api/admin/patients/[id]/toggle-active` | POST | Supabase session + `ADMIN_EMAIL` | N/A | UUID | N/A | Pass |
| `/api/admin/patients/[id]/send-checkin` | POST | Supabase session + `ADMIN_EMAIL` | 1/patient/day | UUID, active check (added), message length 1600 chars (added) | N/A | Fixed |
| `/api/admin/sms-usage` | GET | `ADMIN_API_KEY` Bearer (timing-safe) | N/A | N/A | N/A | Pass |
| `/report/[token]` | Page | JWT (`jwtVerify` via `jose`) + DB lookup | N/A | JWT expiry + tamper detection | N/A | Pass |

---

## Findings and Fixes

### 1. Chat endpoint had no rate limiting (FIXED)

**File:** `apps/web/app/api/chat/route.ts`

**Finding:** Authenticated patients could send unlimited AI requests per hour, creating unbounded Anthropic API cost exposure.

**Fix:** Added `checkChatRateLimit(patient.id)` — 20 requests/hour per patient, sliding window. Returns HTTP 429 on breach. Uses Upstash Redis in production (shared across instances), in-memory fallback for local dev (same pattern as SMS rate limiter). New file: `apps/web/lib/chat/rate-limit.ts`.

---

### 2. send-checkin: no validation on custom message body (FIXED)

**File:** `apps/web/app/api/admin/patients/[id]/send-checkin/route.ts`

**Finding:** The optional `message` field from the request body was passed directly to `sendSMSWithRetry` with no type or length check. An admin could inadvertently send a multi-kilobyte string to Twilio, resulting in excessive SMS segments billed, potential Twilio errors, or accidental data exfiltration.

**Fix:** Added explicit validation: `message` must be a non-empty string, maximum 1600 characters (10 SMS segments). Returns HTTP 400 on violation.

---

### 3. send-checkin: inactive patients not blocked (FIXED)

**File:** `apps/web/app/api/admin/patients/[id]/send-checkin/route.ts`

**Finding:** The route fetched `active` from the patient record but never checked it. An admin could trigger an SMS send to a patient who had been deactivated.

**Fix:** Added guard: returns HTTP 400 `{ error: 'Patient is inactive' }` before reaching the opted-out check.

---

### 4. messages route: NaN offset not guarded (FIXED)

**File:** `apps/web/app/api/admin/patients/[id]/messages/route.ts`

**Finding:** `parseInt` returns `NaN` for non-numeric query params (e.g., `?offset=abc`). `NaN` passed to Supabase `.range(NaN, NaN)` produces an invalid query. Similarly a negative offset would be semantically incorrect.

**Fix:** Replaced bare `parseInt` with guarded expressions: `isNaN` check with safe fallback (limit defaults to 50, offset defaults to 0, limit clamped to 100, offset floored at 0).

---

### 5. require-admin.ts: missing ADMIN_EMAIL not surfaced in logs (FIXED)

**File:** `apps/web/lib/auth/require-admin.ts`

**Finding:** When `ADMIN_EMAIL` is not set, the function silently returns HTTP 403 for all users. This is the correct security behaviour, but a missing env var in production would silently lock out all admin access with no log evidence.

**Fix:** Added `console.error` log when `ADMIN_EMAIL` is not set, before returning the 403 response.

---

### 6. .env.example missing several required env vars (FIXED)

**File:** `apps/web/.env.example`

**Finding:** The following variables were used in code but absent from the example file, creating a risk that new deployments or new developers would miss them:
- `ADMIN_API_KEY` — required by `/api/admin/sms-usage`
- `CRON_SECRET` — required by both cron routes
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` — required by SMS
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` — required for production rate limiting
- `AI_MODEL` — optional override for nudge cron
- `CLINIC_NAME` — optional override for AI prompts

**Fix:** All missing variables added with comments explaining purpose and whether required vs optional.

---

## Unchanged Routes — Findings

### `/api/sms` — Pass
- Twilio signature validated first (before any body parsing side-effects), using constant-time HMAC-SHA1.
- Idempotency check via `twilio_sid` prevents replay attacks.
- Rate limiting via Upstash Redis (10/hr per phone).
- `opted_out` check present.
- Phone normalisation applied before DB lookup.

### `/api/cron/nudge` and `/api/cron/weekly-report` — Pass
- Both check `CRON_SECRET` presence before comparing.
- `verifyBearerToken` uses `timingSafeEqual` from Node's `crypto` module — not vulnerable to timing attacks.
- No user-supplied data in query or body; all data sourced from DB.

### `/api/admin/patients` (POST) and `[id]` (PATCH) — Pass
- E.164 phone format enforced with regex.
- Language constrained to `en` | `zh` allowlist.
- UUID validated before DB queries.
- No raw user content rendered as HTML anywhere in the stack.

### `/report/[token]` page — Pass
- `jwtVerify` from `jose` covers: expiry, signature tamper, algorithm confusion (library uses strict defaults).
- Secondary DB lookup by `token` column provides defense-in-depth — a valid JWT for a deleted report still returns `ExpiredTokenPage`.
- `REPORT_TOKEN_SECRET` absence is handled gracefully (returns expired page, not a 500 or secret exposure).
- No user-supplied data is rendered as raw HTML — all values go through React's JSX escaping.

---

## Remaining / Accepted Risks

| Risk | Severity | Rationale |
|---|---|---|
| Single-admin model (`ADMIN_EMAIL`) | Low | Acceptable for current scale. Multi-admin would require a roles table. |
| In-memory rate limiter fallback for chat | Low | Fallback only used locally. Production requires Upstash (documented in `.env.example`). |
| No CSRF token on admin POST routes | Low | All admin routes check Supabase session cookie + `sameSite` cookie default. CORS preflight is not enforced at route level, but Supabase's cookie auth mitigates CSRF for same-origin requests. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` is public | Informational | Correct by design — anon key is RLS-gated. Service role key (`SUPABASE_SERVICE_ROLE_KEY`) is correctly non-public. |
| No audit log for admin mutations | Low | Out of scope for this sprint; tracked as a future enhancement. |
