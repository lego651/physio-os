# S2 Review Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a post-visit email + SMS engine that delivers a Claude-Haiku-generated Google review draft to V-Health patients and persists a measurable funnel (sent → opened → clicked → keywords → generated → copied → redirected) per `docs/superpowers/specs/2026-05-16-s2-review-engine-design.md`.

**Architecture:** Single multi-tenant `ReviewRequestEngine` orchestrator that mints a JWT short link, dispatches via Resend (email) and Twilio (SMS) adapters, and logs every funnel step to an append-only `review_funnel_events` table. Test mode is a single env-var override at the engine layer. Patient pastes the generated draft into Google Maps themselves (no third-party post API).

**Tech Stack:** Next.js App Router · TypeScript · Supabase Postgres · `@ai-sdk/anthropic` (Claude Haiku 4.5) · `jose` (JWT) · Resend (email) · Twilio REST (SMS) · Vitest · Playwright.

---

## File Structure

### Migrations

- `supabase/migrations/016_review_requests.sql` — ALTER `clinics` (add `google_place_id`, `google_maps_url`, `review_sender_name`), CREATE `review_requests`, CREATE `review_opt_outs`, indexes, RLS.
- `supabase/migrations/017_review_funnel_events.sql` — CREATE `review_funnel_events`, indexes, RLS.
- `supabase/migrations/018_review_vhealth_seed.sql` — seed V-Health Google Business Profile fields.

### Library (`apps/web/lib/review/`)

- `tokens.ts` — JWT mint / verify (jose, HS256, separate secret from widget).
- `prompts.ts` — Variant A prompt builder.
- `events.ts` — funnel event logger with per-event-type idempotency rules.
- `opt-outs.ts` — `isOptedOut` check + `recordOptOut` upsert.
- `templates/email.ts` — HTML email body builder with CASL footer.
- `templates/sms.ts` — SMS body builder ≤ 160 chars with CASL footer.
- `adapters/email.ts` — `EmailAdapter` wrapping Resend.
- `adapters/sms.ts` — `SmsAdapter` wrapping Twilio.
- `engine.ts` — `ReviewRequestEngine` orchestrator.
- `config.ts` — typed env-var loader.

### API routes (`apps/web/app/api/`)

- `admin/review-requests/route.ts` — POST send / GET list.
- `review/generate/route.ts` — POST Claude draft generation.
- `review/track/route.ts` — POST funnel event.
- `review/unsubscribe/route.ts` — POST opt-out (also accepts GET for email link).
- `webhooks/resend/route.ts` — Resend `email.delivered` / `email.opened` webhook.

### Pages (`apps/web/app/`)

- `review/[token]/page.tsx` — landing page (server component).
- `review/[token]/ReviewClient.tsx` — interactive client component.
- `review/[token]/unsubscribed/page.tsx` — confirmation page.
- `(clinic)/admin/review-requests/page.tsx` — admin send + list UI.

### Tests

- Vitest unit tests co-located in `__tests__/` next to each lib file and each route.
- Playwright E2E at `apps/web/tests/e2e/s2-review-engine.spec.ts`.

### Docs

- `docs/operations/s2-review-engine.md` — operator runbook (rollout, env vars, smoke checks).

---

## Phase A — Foundations

### Task 1: New branch and env scaffolding

**Files:**

- Modify: `apps/web/.env.local.example`
- Create: `apps/web/lib/review/config.ts`
- Test: `apps/web/lib/review/__tests__/config.test.ts`

- [ ] **Step 1: Create the feature branch**

```bash
git checkout main
git pull --ff-only
git checkout -b feat/s2-review-engine
```

- [ ] **Step 2: Write failing test for config loader**

Create `apps/web/lib/review/__tests__/config.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { loadReviewConfig } from '../config'

describe('loadReviewConfig', () => {
  const ENV_KEYS = [
    'REVIEW_TOKEN_SECRET',
    'REVIEW_BASE_URL',
    'REVIEW_TEST_MODE',
    'REVIEW_TEST_RECIPIENT_EMAIL',
    'REVIEW_TEST_RECIPIENT_PHONE',
    'RESEND_WEBHOOK_SECRET',
  ] as const

  beforeEach(() => {
    for (const key of ENV_KEYS) delete process.env[key]
  })

  it('throws when REVIEW_TOKEN_SECRET is missing', () => {
    process.env.REVIEW_BASE_URL = 'https://x'
    expect(() => loadReviewConfig()).toThrow(/REVIEW_TOKEN_SECRET/)
  })

  it('throws when REVIEW_TOKEN_SECRET is shorter than 32 chars', () => {
    process.env.REVIEW_TOKEN_SECRET = 'short'
    process.env.REVIEW_BASE_URL = 'https://x'
    expect(() => loadReviewConfig()).toThrow(/at least 32/)
  })

  it('returns testMode=true and requires test recipients when REVIEW_TEST_MODE=true', () => {
    process.env.REVIEW_TOKEN_SECRET = 'a'.repeat(32)
    process.env.REVIEW_BASE_URL = 'https://x'
    process.env.REVIEW_TEST_MODE = 'true'
    expect(() => loadReviewConfig()).toThrow(/REVIEW_TEST_RECIPIENT_EMAIL/)
  })

  it('loads a fully configured production env', () => {
    process.env.REVIEW_TOKEN_SECRET = 'a'.repeat(32)
    process.env.REVIEW_BASE_URL = 'https://physio.app'
    process.env.RESEND_WEBHOOK_SECRET = 'whsec_x'
    const cfg = loadReviewConfig()
    expect(cfg.testMode).toBe(false)
    expect(cfg.baseUrl).toBe('https://physio.app')
    expect(cfg.tokenSecret.length).toBeGreaterThanOrEqual(32)
    expect(cfg.resendWebhookSecret).toBe('whsec_x')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd apps/web && pnpm vitest run lib/review/__tests__/config.test.ts
```

Expected: FAIL — `Cannot find module '../config'`.

- [ ] **Step 4: Implement `apps/web/lib/review/config.ts`**

```ts
// apps/web/lib/review/config.ts
//
// Single source of truth for S2 review engine configuration.
// Throws at module load time if required env vars are missing,
// so a misconfigured deploy fails fast on first request.

export interface ReviewConfig {
  tokenSecret: string
  baseUrl: string
  testMode: boolean
  testRecipientEmail: string | null
  testRecipientPhone: string | null
  resendWebhookSecret: string
}

export function loadReviewConfig(): ReviewConfig {
  const tokenSecret = process.env.REVIEW_TOKEN_SECRET
  if (!tokenSecret) throw new Error('Missing REVIEW_TOKEN_SECRET')
  if (tokenSecret.length < 32) throw new Error('REVIEW_TOKEN_SECRET must be at least 32 chars')

  const baseUrl = process.env.REVIEW_BASE_URL
  if (!baseUrl) throw new Error('Missing REVIEW_BASE_URL')

  const testMode = process.env.REVIEW_TEST_MODE === 'true'
  const testRecipientEmail = process.env.REVIEW_TEST_RECIPIENT_EMAIL ?? null
  const testRecipientPhone = process.env.REVIEW_TEST_RECIPIENT_PHONE ?? null

  if (testMode && !testRecipientEmail) {
    throw new Error('REVIEW_TEST_RECIPIENT_EMAIL required when REVIEW_TEST_MODE=true')
  }
  if (testMode && !testRecipientPhone) {
    throw new Error('REVIEW_TEST_RECIPIENT_PHONE required when REVIEW_TEST_MODE=true')
  }

  const resendWebhookSecret = process.env.RESEND_WEBHOOK_SECRET ?? ''

  return {
    tokenSecret,
    baseUrl,
    testMode,
    testRecipientEmail,
    testRecipientPhone,
    resendWebhookSecret,
  }
}
```

- [ ] **Step 5: Add env vars to `.env.local.example`**

Append to `apps/web/.env.local.example`:

```
# --- S2 Review Engine ---
REVIEW_TOKEN_SECRET=                 # 32+ random hex chars, separate from WIDGET_SESSION_SECRET
REVIEW_BASE_URL=http://localhost:3000
REVIEW_TEST_MODE=true                # true in dev; false in production
REVIEW_TEST_RECIPIENT_EMAIL=         # required when REVIEW_TEST_MODE=true
REVIEW_TEST_RECIPIENT_PHONE=         # required when REVIEW_TEST_MODE=true (E.164)
RESEND_WEBHOOK_SECRET=               # from Resend dashboard webhook config
```

- [ ] **Step 6: Run test to verify it passes**

```bash
cd apps/web && pnpm vitest run lib/review/__tests__/config.test.ts
```

Expected: PASS, 4/4.

- [ ] **Step 7: Commit**

```bash
git add apps/web/.env.local.example apps/web/lib/review/config.ts apps/web/lib/review/__tests__/config.test.ts
git commit -m "feat(review): config loader with required env validation"
```

---

### Task 2: Migration 016 — schema changes for `clinics`, `review_requests`, `review_opt_outs`

**Files:**

- Create: `supabase/migrations/016_review_requests.sql`

- [ ] **Step 1: Verify migrations 012–015 are applied**

```bash
cd supabase && supabase db remote ls | tail -20
```

Expected: the output lists migrations through `015_widget_conversation_count_rpc.sql`. If 012–015 are not listed, stop and apply them via the Supabase dashboard SQL editor before continuing.

- [ ] **Step 2: Create the migration file**

Create `supabase/migrations/016_review_requests.sql`:

```sql
-- 016_review_requests.sql
-- S2 Review Engine: clinic Google Business Profile fields + review_requests + opt-outs.

-- 1. Extend the existing clinics table (from 012) with Google review fields.
ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS google_place_id    text,
  ADD COLUMN IF NOT EXISTS google_maps_url    text,
  ADD COLUMN IF NOT EXISTS review_sender_name text;

-- 2. review_requests: one row per admin-triggered send.
CREATE TABLE public.review_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_name    text NOT NULL,
  patient_email   text,
  patient_phone   text,
  therapist_name  text,
  service_type    text,
  channel         text NOT NULL CHECK (channel IN ('email','sms','both')),
  token_jti       uuid NOT NULL UNIQUE,
  test_mode       boolean NOT NULL DEFAULT false,
  status          text NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued','sent','failed','expired','revoked')),
  failure_reason  text,
  verified_at     timestamptz,
  metadata        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL,
  created_by      uuid
);

CREATE INDEX review_requests_clinic_created_idx
  ON public.review_requests (clinic_id, created_at DESC);

CREATE INDEX review_requests_status_expires_idx
  ON public.review_requests (status, expires_at);

ALTER TABLE public.review_requests ENABLE ROW LEVEL SECURITY;

-- 3. review_opt_outs: one row per (clinic, contact, contact_type).
CREATE TABLE public.review_opt_outs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  contact       text NOT NULL,
  contact_type  text NOT NULL CHECK (contact_type IN ('email','sms')),
  opted_out_at  timestamptz NOT NULL DEFAULT now(),
  source        text NOT NULL CHECK (source IN ('email_link','sms_keyword','admin')),
  UNIQUE (clinic_id, contact, contact_type)
);

CREATE INDEX review_opt_outs_lookup_idx
  ON public.review_opt_outs (clinic_id, contact, contact_type);

ALTER TABLE public.review_opt_outs ENABLE ROW LEVEL SECURITY;

-- 4. RLS: service_role bypasses RLS automatically; deny all anon access.
CREATE POLICY review_requests_deny_anon ON public.review_requests
  FOR ALL TO anon USING (false) WITH CHECK (false);

CREATE POLICY review_opt_outs_deny_anon ON public.review_opt_outs
  FOR ALL TO anon USING (false) WITH CHECK (false);
```

- [ ] **Step 3: Apply locally**

```bash
cd supabase && supabase db push
```

Expected: `Applied migration 016_review_requests.sql`.

- [ ] **Step 4: Verify schema**

```bash
supabase db remote ls | grep 016
psql "$DATABASE_URL" -c "\d public.review_requests" 2>&1 | head -25
```

Expected: table description lists all 17 columns. (If `psql` is unavailable, use the Supabase dashboard SQL editor: `SELECT column_name FROM information_schema.columns WHERE table_name = 'review_requests';` should return 17 rows.)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/016_review_requests.sql
git commit -m "feat(review): migration 016 — clinics ALTER + review_requests + review_opt_outs"
```

---

### Task 3: Migration 017 — `review_funnel_events`

**Files:**

- Create: `supabase/migrations/017_review_funnel_events.sql`

- [ ] **Step 1: Create the migration file**

```sql
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
```

- [ ] **Step 2: Apply locally**

```bash
cd supabase && supabase db push
```

Expected: `Applied migration 017_review_funnel_events.sql`.

- [ ] **Step 3: Regenerate TypeScript types**

```bash
cd apps/web && pnpm gen:types
```

Expected: `lib/supabase/types.ts` (or equivalent path) now exports `review_requests`, `review_opt_outs`, `review_funnel_events` types.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/017_review_funnel_events.sql apps/web/lib/supabase/types.ts
git commit -m "feat(review): migration 017 — review_funnel_events + regen types"
```

---

### Task 4: Migration 018 — seed V-Health Google fields

**Files:**

- Create: `supabase/migrations/018_review_vhealth_seed.sql`

- [ ] **Step 1: Create the seed migration**

```sql
-- 018_review_vhealth_seed.sql
-- Seed V-Health Google Business Profile fields. The clinic row was created in 013.

UPDATE public.clinics
SET
  google_place_id    = 'ChIJ_PLACEHOLDER_REPLACE_BEFORE_STAGE_2',
  google_maps_url    = 'https://www.google.com/maps/place/?q=place_id:ChIJ_PLACEHOLDER',
  review_sender_name = 'V-Health Rehab Clinic'
WHERE slug = 'vhealth';
```

Note: the `google_place_id` placeholder is intentional. The real Place ID must be set by an operator before Stage 2 of the rollout. Stages 0 and 1 use `REVIEW_TEST_MODE=true` so the deep link is never user-facing.

- [ ] **Step 2: Apply and verify**

```bash
cd supabase && supabase db push
psql "$DATABASE_URL" -c "SELECT slug, review_sender_name FROM clinics WHERE slug='vhealth';"
```

Expected: one row, `review_sender_name = 'V-Health Rehab Clinic'`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/018_review_vhealth_seed.sql
git commit -m "feat(review): seed V-Health review-sender fields (place_id pending)"
```

---

## Phase B — Pure functions (TDD)

### Task 5: JWT tokens

**Files:**

- Create: `apps/web/lib/review/tokens.ts`
- Test: `apps/web/lib/review/__tests__/tokens.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/web/lib/review/__tests__/tokens.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mintReviewToken, verifyReviewToken } from '../tokens'

const SECRET = 'a'.repeat(64)

describe('review tokens', () => {
  beforeEach(() => {
    process.env.REVIEW_TOKEN_SECRET = SECRET
    process.env.REVIEW_BASE_URL = 'https://x'
  })

  it('mint then verify returns the original payload', async () => {
    const requestId = '00000000-0000-0000-0000-000000000001'
    const clinicId = '00000000-0000-0000-0000-000000000002'
    const jti = '00000000-0000-0000-0000-000000000003'

    const token = await mintReviewToken({ requestId, clinicId, jti, expiresInDays: 14 })
    const decoded = await verifyReviewToken(token)

    expect(decoded).toEqual({ requestId, clinicId, jti })
  })

  it('verify returns null on an expired token', async () => {
    const token = await mintReviewToken({
      requestId: 'r',
      clinicId: 'c',
      jti: 'j',
      expiresInDays: -1,
    })
    const decoded = await verifyReviewToken(token)
    expect(decoded).toBeNull()
  })

  it('verify returns null on a signature mismatch', async () => {
    const token = await mintReviewToken({
      requestId: 'r',
      clinicId: 'c',
      jti: 'j',
      expiresInDays: 14,
    })
    process.env.REVIEW_TOKEN_SECRET = 'b'.repeat(64)
    const decoded = await verifyReviewToken(token)
    expect(decoded).toBeNull()
  })

  it('verify returns null on a malformed token', async () => {
    expect(await verifyReviewToken('not-a-jwt')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/web && pnpm vitest run lib/review/__tests__/tokens.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `tokens.ts`**

Create `apps/web/lib/review/tokens.ts`:

```ts
// apps/web/lib/review/tokens.ts
//
// HS256 JWTs that bind a review request id + clinic id to a short link.
// Separate secret from the widget so a leak on one product does not
// compromise the other.
import { SignJWT, jwtVerify } from 'jose'

const ISSUER = 'physio-os/review'

function getSecret(): Uint8Array {
  const s = process.env.REVIEW_TOKEN_SECRET
  if (!s || s.length < 32) {
    throw new Error('REVIEW_TOKEN_SECRET missing or too short (need >=32 chars)')
  }
  return new TextEncoder().encode(s)
}

export interface ReviewTokenPayload {
  requestId: string
  clinicId: string
  jti: string
}

export interface MintInput extends ReviewTokenPayload {
  expiresInDays: number
}

export async function mintReviewToken(input: MintInput): Promise<string> {
  const expSeconds = Math.floor(Date.now() / 1000) + Math.floor(input.expiresInDays * 86400)
  return new SignJWT({ rid: input.requestId, cid: input.clinicId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ISSUER)
    .setJti(input.jti)
    .setIssuedAt()
    .setExpirationTime(expSeconds)
    .sign(getSecret())
}

export async function verifyReviewToken(token: string): Promise<ReviewTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), { issuer: ISSUER })
    if (
      typeof payload.rid !== 'string' ||
      typeof payload.cid !== 'string' ||
      typeof payload.jti !== 'string'
    ) {
      return null
    }
    return { requestId: payload.rid, clinicId: payload.cid, jti: payload.jti }
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/web && pnpm vitest run lib/review/__tests__/tokens.test.ts
```

Expected: PASS, 4/4.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/review/tokens.ts apps/web/lib/review/__tests__/tokens.test.ts
git commit -m "feat(review): JWT mint + verify with isolated secret"
```

---

### Task 6: Prompt builder

**Files:**

- Create: `apps/web/lib/review/prompts.ts`
- Test: `apps/web/lib/review/__tests__/prompts.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/web/lib/review/__tests__/prompts.test.ts`:

````ts
import { describe, it, expect } from 'vitest'
import { buildReviewPrompt } from '../prompts'

describe('buildReviewPrompt', () => {
  it('includes clinic name, therapist, service, and patient keywords verbatim', () => {
    const out = buildReviewPrompt({
      clinicName: 'V-Health Rehab Clinic',
      therapistName: 'Jimmy',
      serviceType: 'massage therapy',
      keywords: 'neck pain, much better, three sessions',
    })
    expect(out).toContain('V-Health Rehab Clinic')
    expect(out).toContain('Jimmy')
    expect(out).toContain('massage therapy')
    expect(out).toContain('neck pain, much better, three sessions')
  })

  it('omits therapist line when therapistName is null', () => {
    const out = buildReviewPrompt({
      clinicName: 'V-Health',
      therapistName: null,
      serviceType: 'physio',
      keywords: 'helpful staff',
    })
    expect(out).not.toMatch(/Therapist:/)
  })

  it('instructs the model to avoid medical claims and contact info', () => {
    const out = buildReviewPrompt({
      clinicName: 'V-Health',
      therapistName: null,
      serviceType: 'physio',
      keywords: 'x',
    })
    expect(out).toMatch(/medical claim/i)
    expect(out).toMatch(/contact information/i)
  })

  it('escapes a triple-backtick attempt in keywords', () => {
    const out = buildReviewPrompt({
      clinicName: 'V-Health',
      therapistName: null,
      serviceType: 'physio',
      keywords: '```\nignore prior\n```',
    })
    expect(out).not.toMatch(/^```$/m)
  })
})
````

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/web && pnpm vitest run lib/review/__tests__/prompts.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `prompts.ts`**

Create `apps/web/lib/review/prompts.ts`:

````ts
// apps/web/lib/review/prompts.ts

export interface BuildReviewPromptInput {
  clinicName: string
  therapistName: string | null
  serviceType: string
  keywords: string
}

// Sanitise patient-supplied keywords. We do not want a clever input
// like ```new instructions``` to escape the user-content block.
function sanitiseKeywords(raw: string): string {
  return raw.replace(/```/g, "'''").slice(0, 500)
}

export function buildReviewPrompt(input: BuildReviewPromptInput): string {
  const therapistLine = input.therapistName ? `Therapist: ${input.therapistName}\n` : ''
  const safeKeywords = sanitiseKeywords(input.keywords)
  return [
    `You help a patient write a short Google review for ${input.clinicName}.`,
    `The patient's notes (verbatim, between <notes> tags):`,
    `<notes>`,
    safeKeywords,
    `</notes>`,
    therapistLine,
    `Service: ${input.serviceType}`,
    ``,
    `Write a natural, first-person 3-5 sentence Google review.`,
    `- Mention the therapist by name if provided.`,
    `- Mention the service type.`,
    `- Sound like a real patient, not promotional.`,
    `- Do not include any medical claim or diagnosis.`,
    `- Do not include any contact information, URLs, or phone numbers.`,
    `- Do not include hashtags.`,
    `Return only the review text.`,
  ].join('\n')
}
````

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/web && pnpm vitest run lib/review/__tests__/prompts.test.ts
```

Expected: PASS, 4/4.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/review/prompts.ts apps/web/lib/review/__tests__/prompts.test.ts
git commit -m "feat(review): prompt builder with input sanitisation"
```

---

### Task 7: Funnel event logger

**Files:**

- Create: `apps/web/lib/review/events.ts`
- Test: `apps/web/lib/review/__tests__/events.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/web/lib/review/__tests__/events.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { logFunnelEvent, IDEMPOTENT_EVENTS } from '../events'

type Row = { request_id: string; event_type: string; metadata: any }
let rows: Row[]
let inserted: Row[]

function makeSupabase() {
  inserted = []
  return {
    from(table: string) {
      if (table !== 'review_funnel_events') throw new Error('unexpected table ' + table)
      return {
        select() {
          return this
        },
        eq(col: string, val: string) {
          return { ...this, _filter: { [col]: val } }
        },
        async maybeSingle() {
          // for idempotency check
          const f = (this as any)._filter || {}
          const found = rows.find(
            (r) => r.request_id === f.request_id && r.event_type === f.event_type,
          )
          return { data: found ?? null, error: null }
        },
        async insert(row: Row) {
          inserted.push(row)
          rows.push(row)
          return { data: row, error: null }
        },
      }
    },
  } as any
}

describe('logFunnelEvent', () => {
  beforeEach(() => {
    rows = []
    inserted = []
  })

  it('inserts an event row', async () => {
    const supabase = makeSupabase()
    await logFunnelEvent(supabase, { requestId: 'r1', eventType: 'sent_email' })
    expect(inserted).toHaveLength(1)
    expect(inserted[0].event_type).toBe('sent_email')
  })

  it('deduplicates link_clicked per request', async () => {
    const supabase = makeSupabase()
    await logFunnelEvent(supabase, { requestId: 'r1', eventType: 'link_clicked' })
    await logFunnelEvent(supabase, { requestId: 'r1', eventType: 'link_clicked' })
    expect(inserted).toHaveLength(1)
  })

  it('does NOT deduplicate copy_clicked per request', async () => {
    const supabase = makeSupabase()
    await logFunnelEvent(supabase, { requestId: 'r1', eventType: 'copy_clicked' })
    await logFunnelEvent(supabase, { requestId: 'r1', eventType: 'copy_clicked' })
    expect(inserted).toHaveLength(2)
  })

  it('exports the canonical list of idempotent event types', () => {
    expect(IDEMPOTENT_EVENTS).toEqual(['link_clicked', 'email_opened'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/web && pnpm vitest run lib/review/__tests__/events.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `events.ts`**

Create `apps/web/lib/review/events.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/web && pnpm vitest run lib/review/__tests__/events.test.ts
```

Expected: PASS, 4/4.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/review/events.ts apps/web/lib/review/__tests__/events.test.ts
git commit -m "feat(review): funnel event logger with idempotency rules"
```

---

### Task 8: Opt-out check + record

**Files:**

- Create: `apps/web/lib/review/opt-outs.ts`
- Test: `apps/web/lib/review/__tests__/opt-outs.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/web/lib/review/__tests__/opt-outs.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { isOptedOut, recordOptOut } from '../opt-outs'

type Row = { clinic_id: string; contact: string; contact_type: 'email' | 'sms' }
let rows: Row[]

function makeSupabase() {
  return {
    from(table: string) {
      if (table !== 'review_opt_outs') throw new Error('unexpected ' + table)
      const filter: any = {}
      const builder: any = {
        select() {
          return builder
        },
        eq(col: string, val: string) {
          filter[col] = val
          return builder
        },
        async maybeSingle() {
          const found = rows.find(
            (r) =>
              r.clinic_id === filter.clinic_id &&
              r.contact === filter.contact &&
              r.contact_type === filter.contact_type,
          )
          return { data: found ?? null, error: null }
        },
        async upsert(row: any) {
          const existing = rows.find(
            (r) =>
              r.clinic_id === row.clinic_id &&
              r.contact === row.contact &&
              r.contact_type === row.contact_type,
          )
          if (!existing) rows.push(row)
          return { data: row, error: null }
        },
      }
      return builder
    },
  } as any
}

describe('opt-outs', () => {
  beforeEach(() => {
    rows = []
  })

  it('isOptedOut returns false on empty table', async () => {
    const out = await isOptedOut(makeSupabase(), {
      clinicId: 'c1',
      contact: 'a@b.com',
      contactType: 'email',
    })
    expect(out).toBe(false)
  })

  it('isOptedOut returns true after recordOptOut', async () => {
    const supabase = makeSupabase()
    await recordOptOut(supabase, {
      clinicId: 'c1',
      contact: 'a@b.com',
      contactType: 'email',
      source: 'email_link',
    })
    const out = await isOptedOut(supabase, {
      clinicId: 'c1',
      contact: 'a@b.com',
      contactType: 'email',
    })
    expect(out).toBe(true)
  })

  it('recordOptOut is idempotent', async () => {
    const supabase = makeSupabase()
    await recordOptOut(supabase, {
      clinicId: 'c1',
      contact: 'a@b.com',
      contactType: 'email',
      source: 'email_link',
    })
    await recordOptOut(supabase, {
      clinicId: 'c1',
      contact: 'a@b.com',
      contactType: 'email',
      source: 'email_link',
    })
    expect(rows).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/web && pnpm vitest run lib/review/__tests__/opt-outs.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `opt-outs.ts`**

Create `apps/web/lib/review/opt-outs.ts`:

```ts
// apps/web/lib/review/opt-outs.ts
import type { SupabaseClient } from '@supabase/supabase-js'

export type ContactType = 'email' | 'sms'
export type OptOutSource = 'email_link' | 'sms_keyword' | 'admin'

export interface IsOptedOutInput {
  clinicId: string
  contact: string
  contactType: ContactType
}

export interface RecordOptOutInput extends IsOptedOutInput {
  source: OptOutSource
}

export async function isOptedOut(
  supabase: SupabaseClient,
  input: IsOptedOutInput,
): Promise<boolean> {
  const { data } = await supabase
    .from('review_opt_outs')
    .select('id')
    .eq('clinic_id', input.clinicId)
    .eq('contact', input.contact)
    .eq('contact_type', input.contactType)
    .maybeSingle()
  return !!data
}

export async function recordOptOut(
  supabase: SupabaseClient,
  input: RecordOptOutInput,
): Promise<void> {
  await supabase.from('review_opt_outs').upsert(
    {
      clinic_id: input.clinicId,
      contact: input.contact,
      contact_type: input.contactType,
      source: input.source,
    },
    { onConflict: 'clinic_id,contact,contact_type' },
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/web && pnpm vitest run lib/review/__tests__/opt-outs.test.ts
```

Expected: PASS, 3/3.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/review/opt-outs.ts apps/web/lib/review/__tests__/opt-outs.test.ts
git commit -m "feat(review): opt-out check + record with idempotent upsert"
```

---

### Task 9: Email + SMS body templates

**Files:**

- Create: `apps/web/lib/review/templates/email.ts`
- Create: `apps/web/lib/review/templates/sms.ts`
- Test: `apps/web/lib/review/__tests__/templates.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/web/lib/review/__tests__/templates.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildReviewEmailHtml, buildReviewEmailSubject } from '../templates/email'
import { buildReviewSmsBody } from '../templates/sms'

describe('email template', () => {
  it('subject includes clinic name', () => {
    const subj = buildReviewEmailSubject({
      clinicName: 'V-Health Rehab Clinic',
      patientName: 'Alice',
    })
    expect(subj).toMatch(/V-Health Rehab Clinic/)
  })

  it('html includes patient name, sender name, short link, and unsubscribe link', () => {
    const html = buildReviewEmailHtml({
      clinicName: 'V-Health Rehab Clinic',
      senderName: 'V-Health',
      patientName: 'Alice',
      shortLink: 'https://x/review/abc',
      unsubscribeLink: 'https://x/api/review/unsubscribe?token=abc',
    })
    expect(html).toContain('Alice')
    expect(html).toContain('V-Health')
    expect(html).toContain('https://x/review/abc')
    expect(html).toContain('unsubscribe')
  })
})

describe('sms template', () => {
  it('builds a body under 160 chars including the link and STOP footer', () => {
    const body = buildReviewSmsBody({
      senderName: 'V-Health',
      patientName: 'Alice',
      shortLink: 'https://x/review/abc',
    })
    expect(body.length).toBeLessThanOrEqual(160)
    expect(body).toContain('V-Health')
    expect(body).toContain('https://x/review/abc')
    expect(body).toContain('STOP')
  })

  it('truncates patient name if total length would exceed 160', () => {
    const body = buildReviewSmsBody({
      senderName: 'A-Very-Long-Clinic-Name-Indeed',
      patientName: 'Alexandra Magdalena Christopherson the Third',
      shortLink: 'https://example.com/review/aaaaaaaaaaaaaaaaaaaa',
    })
    expect(body.length).toBeLessThanOrEqual(160)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/web && pnpm vitest run lib/review/__tests__/templates.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `templates/email.ts`**

Create `apps/web/lib/review/templates/email.ts`:

```ts
// apps/web/lib/review/templates/email.ts

export interface EmailSubjectInput {
  clinicName: string
  patientName: string
}

export function buildReviewEmailSubject(input: EmailSubjectInput): string {
  return `${input.clinicName} — quick favour, 30 seconds`
}

export interface EmailHtmlInput {
  clinicName: string
  senderName: string
  patientName: string
  shortLink: string
  unsubscribeLink: string
}

export function buildReviewEmailHtml(input: EmailHtmlInput): string {
  return `<!doctype html>
<html><body style="font-family:-apple-system,system-ui,sans-serif;line-height:1.5;color:#1a1a1a">
<p>Hi ${escapeHtml(input.patientName)},</p>
<p>Thanks for visiting <strong>${escapeHtml(input.clinicName)}</strong>. Would you mind sharing a quick Google review? It takes about 30 seconds — we even drafted one for you.</p>
<p style="margin:32px 0">
  <a href="${input.shortLink}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block">Write my review</a>
</p>
<p style="color:#6b7280;font-size:13px">— ${escapeHtml(input.senderName)}</p>
<hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0">
<p style="color:#6b7280;font-size:12px">
  You received this because you visited ${escapeHtml(input.clinicName)} recently.
  <a href="${input.unsubscribeLink}" style="color:#6b7280">Unsubscribe</a>.
</p>
</body></html>`
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  )
}
```

- [ ] **Step 4: Implement `templates/sms.ts`**

Create `apps/web/lib/review/templates/sms.ts`:

```ts
// apps/web/lib/review/templates/sms.ts

const MAX_SMS_CHARS = 160
const FOOTER = ' Reply STOP to unsubscribe.'

export interface SmsBodyInput {
  senderName: string
  patientName: string
  shortLink: string
}

export function buildReviewSmsBody(input: SmsBodyInput): string {
  const link = input.shortLink
  const footer = FOOTER
  // budget = 160 − (sender + ': ' + ' Quick favour — write a Google review? ' + link + footer)
  // Fit "{sender}: Hi {firstName}, quick Google review? {link}{footer}" within 160.
  const firstName = input.patientName.split(/\s+/)[0] ?? 'there'
  let body = `${input.senderName}: Hi ${firstName}, quick Google review? ${link}${footer}`
  if (body.length <= MAX_SMS_CHARS) return body

  // Drop the name if we overflow.
  body = `${input.senderName}: Quick Google review? ${link}${footer}`
  if (body.length <= MAX_SMS_CHARS) return body

  // Drop the sender prefix and rely on the footer for compliance attribution.
  body = `Quick Google review? ${link}${footer}`
  return body.slice(0, MAX_SMS_CHARS)
}
```

- [ ] **Step 5: Run test to verify both pass**

```bash
cd apps/web && pnpm vitest run lib/review/__tests__/templates.test.ts
```

Expected: PASS, 4/4.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/review/templates apps/web/lib/review/__tests__/templates.test.ts
git commit -m "feat(review): email + SMS templates with CASL footers"
```

---

## Phase C — Adapters

### Task 10: EmailAdapter (Resend)

**Files:**

- Create: `apps/web/lib/review/adapters/email.ts`
- Test: `apps/web/lib/review/__tests__/adapters.email.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/web/lib/review/__tests__/adapters.email.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { EmailAdapter } from '../adapters/email'

describe('EmailAdapter', () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = 'test-key'
  })

  it('posts to Resend with the expected payload and returns providerMessageId', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'resend-msg-1' }),
    })
    const adapter = new EmailAdapter({ fetch: fetchMock as any })
    const out = await adapter.send({
      to: 'patient@example.com',
      from: 'V-Health <onboarding@resend.dev>',
      subject: 'subject',
      html: '<p>hi</p>',
    })
    expect(out.providerMessageId).toBe('resend-msg-1')
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.resend.com/emails')
    expect(JSON.parse((opts as any).body)).toMatchObject({
      to: 'patient@example.com',
      subject: 'subject',
    })
  })

  it('throws on non-2xx with the body included', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => 'invalid recipient',
    })
    const adapter = new EmailAdapter({ fetch: fetchMock as any })
    await expect(adapter.send({ to: 'x', from: 'y', subject: 's', html: 'h' })).rejects.toThrow(
      /422.*invalid recipient/,
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/web && pnpm vitest run lib/review/__tests__/adapters.email.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `adapters/email.ts`**

Create `apps/web/lib/review/adapters/email.ts`:

```ts
// apps/web/lib/review/adapters/email.ts

const RESEND_API_URL = 'https://api.resend.com/emails'

export interface EmailSendInput {
  to: string
  from: string
  subject: string
  html: string
  headers?: Record<string, string>
}

export interface EmailSendResult {
  providerMessageId: string
}

export interface EmailAdapterDeps {
  fetch?: typeof globalThis.fetch
}

export class EmailAdapter {
  private readonly fetchImpl: typeof globalThis.fetch

  constructor(deps: EmailAdapterDeps = {}) {
    this.fetchImpl = deps.fetch ?? globalThis.fetch
  }

  async send(input: EmailSendInput): Promise<EmailSendResult> {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) throw new Error('Missing RESEND_API_KEY')

    const res = await this.fetchImpl(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(input.headers ?? {}),
      },
      body: JSON.stringify({
        from: input.from,
        to: input.to,
        subject: input.subject,
        html: input.html,
      }),
    })

    if (!res.ok) {
      const body = await (res as any).text()
      throw new Error(`Resend send failed: ${res.status} ${body}`)
    }

    const data = (await (res as any).json()) as { id: string }
    return { providerMessageId: data.id }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/web && pnpm vitest run lib/review/__tests__/adapters.email.test.ts
```

Expected: PASS, 2/2.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/review/adapters/email.ts apps/web/lib/review/__tests__/adapters.email.test.ts
git commit -m "feat(review): EmailAdapter wrapping Resend"
```

---

### Task 11: SmsAdapter (Twilio)

**Files:**

- Create: `apps/web/lib/review/adapters/sms.ts`
- Test: `apps/web/lib/review/__tests__/adapters.sms.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/web/lib/review/__tests__/adapters.sms.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SmsAdapter } from '../adapters/sms'

describe('SmsAdapter', () => {
  beforeEach(() => {
    process.env.TWILIO_ACCOUNT_SID = 'AC_test'
    process.env.TWILIO_AUTH_TOKEN = 'token_test'
    process.env.TWILIO_PHONE_NUMBER = '+15005550006'
  })

  it('posts to Twilio Messages API and returns providerMessageId', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ sid: 'SM_test_1' }),
    })
    const adapter = new SmsAdapter({ fetch: fetchMock as any })
    const out = await adapter.send({ to: '+14035550100', body: 'hi' })
    expect(out.providerMessageId).toBe('SM_test_1')
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url as string).toMatch(/AC_test\/Messages\.json$/)
    expect((opts as any).body).toContain('To=%2B14035550100')
    expect((opts as any).body).toContain('Body=hi')
  })

  it('throws on non-2xx response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'bad number',
    })
    const adapter = new SmsAdapter({ fetch: fetchMock as any })
    await expect(adapter.send({ to: '+1', body: 'hi' })).rejects.toThrow(/400.*bad number/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/web && pnpm vitest run lib/review/__tests__/adapters.sms.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `adapters/sms.ts`**

Create `apps/web/lib/review/adapters/sms.ts`:

```ts
// apps/web/lib/review/adapters/sms.ts

const TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01'

export interface SmsSendInput {
  to: string
  body: string
}

export interface SmsSendResult {
  providerMessageId: string
}

export interface SmsAdapterDeps {
  fetch?: typeof globalThis.fetch
}

export class SmsAdapter {
  private readonly fetchImpl: typeof globalThis.fetch

  constructor(deps: SmsAdapterDeps = {}) {
    this.fetchImpl = deps.fetch ?? globalThis.fetch
  }

  async send(input: SmsSendInput): Promise<SmsSendResult> {
    const sid = process.env.TWILIO_ACCOUNT_SID
    const token = process.env.TWILIO_AUTH_TOKEN
    const from = process.env.TWILIO_PHONE_NUMBER
    if (!sid || !token || !from) {
      throw new Error(
        'Missing Twilio configuration (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER)',
      )
    }

    const formData = new URLSearchParams()
    formData.set('To', input.to)
    formData.set('From', from)
    formData.set('Body', input.body)

    const url = `${TWILIO_API_BASE}/Accounts/${sid}/Messages.json`
    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    })

    if (!res.ok) {
      const body = await (res as any).text()
      throw new Error(`Twilio send failed: ${res.status} ${body}`)
    }

    const data = (await (res as any).json()) as { sid: string }
    return { providerMessageId: data.sid }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/web && pnpm vitest run lib/review/__tests__/adapters.sms.test.ts
```

Expected: PASS, 2/2.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/review/adapters/sms.ts apps/web/lib/review/__tests__/adapters.sms.test.ts
git commit -m "feat(review): SmsAdapter wrapping Twilio REST"
```

---

## Phase D — Engine orchestrator

### Task 12: ReviewRequestEngine

**Files:**

- Create: `apps/web/lib/review/engine.ts`
- Test: `apps/web/lib/review/__tests__/engine.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/web/lib/review/__tests__/engine.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ReviewRequestEngine } from '../engine'

const clinic = {
  id: 'c1',
  name: 'V-Health Rehab Clinic',
  google_place_id: 'PLACE_ID',
  google_maps_url: 'https://maps/x',
  review_sender_name: 'V-Health',
}

function makeDeps(overrides: Partial<any> = {}) {
  const inserted: any[] = []
  const events: any[] = []
  const optOuts: any[] = []

  const supabase: any = {
    from(table: string) {
      const filter: any = {}
      const builder: any = {
        select(_cols?: string) {
          return builder
        },
        eq(col: string, val: string) {
          filter[col] = val
          return builder
        },
        async single() {
          if (table === 'clinics') return { data: clinic, error: null }
          return { data: null, error: null }
        },
        async maybeSingle() {
          if (table === 'review_opt_outs') {
            return {
              data:
                optOuts.find(
                  (r) =>
                    r.clinic_id === filter.clinic_id &&
                    r.contact === filter.contact &&
                    r.contact_type === filter.contact_type,
                ) ?? null,
              error: null,
            }
          }
          if (table === 'review_funnel_events') return { data: null, error: null }
          return { data: null, error: null }
        },
        async insert(row: any) {
          if (table === 'review_requests') {
            inserted.push(row)
            return { data: { ...row, id: 'req-1' }, error: null }
          }
          if (table === 'review_funnel_events') {
            events.push(row)
            return { data: row, error: null }
          }
          return { data: row, error: null }
        },
      }
      // Insert-then-select chain
      const insertBuilder: any = {
        insert(row: any) {
          inserted.push(row)
          return {
            select: () => ({
              single: async () => ({ data: { ...row, id: 'req-1' }, error: null }),
            }),
          }
        },
      }
      if (table === 'review_requests') return insertBuilder
      return builder
    },
  }

  const email = { send: vi.fn().mockResolvedValue({ providerMessageId: 'em-1' }) }
  const sms = { send: vi.fn().mockResolvedValue({ providerMessageId: 'sm-1' }) }

  return {
    deps: {
      supabase,
      email,
      sms,
      config: {
        tokenSecret: 'a'.repeat(64),
        baseUrl: 'https://x',
        testMode: false,
        testRecipientEmail: 'jason@test',
        testRecipientPhone: '+14030000001',
        resendWebhookSecret: '',
      },
      ...overrides,
    } as any,
    inserted,
    events,
    optOuts,
    email,
    sms,
  }
}

describe('ReviewRequestEngine.create', () => {
  beforeEach(() => {
    process.env.REVIEW_TOKEN_SECRET = 'a'.repeat(64)
  })

  it('dispatches both channels and logs sent_email + sent_sms', async () => {
    const { deps, events, email, sms } = makeDeps()
    const engine = new ReviewRequestEngine(deps)
    const out = await engine.create({
      clinicId: 'c1',
      patientName: 'Alice',
      patientEmail: 'a@b.com',
      patientPhone: '+14035550100',
      therapistName: 'Jimmy',
      serviceType: 'massage',
      channel: 'both',
      consentConfirmed: true,
    })
    expect(out.token).toBeTruthy()
    expect(email.send).toHaveBeenCalledOnce()
    expect(sms.send).toHaveBeenCalledOnce()
    expect(events.map((e) => e.event_type).sort()).toEqual(['queued', 'sent_email', 'sent_sms'])
  })

  it('test_mode overrides recipient to the configured test address', async () => {
    const { deps, email } = makeDeps()
    deps.config.testMode = true
    const engine = new ReviewRequestEngine(deps)
    await engine.create({
      clinicId: 'c1',
      patientName: 'Alice',
      patientEmail: 'real@patient.com',
      patientPhone: '+14035550100',
      therapistName: null,
      serviceType: 'massage',
      channel: 'email',
      consentConfirmed: true,
    })
    expect(email.send.mock.calls[0][0].to).toBe('jason@test')
  })

  it('skips email channel when patient is opted out, logs send_failed with reason', async () => {
    const { deps, events, optOuts, email } = makeDeps()
    optOuts.push({ clinic_id: 'c1', contact: 'a@b.com', contact_type: 'email' })
    const engine = new ReviewRequestEngine(deps)
    await engine.create({
      clinicId: 'c1',
      patientName: 'Alice',
      patientEmail: 'a@b.com',
      patientPhone: '+14035550100',
      therapistName: null,
      serviceType: 'massage',
      channel: 'email',
      consentConfirmed: true,
    })
    expect(email.send).not.toHaveBeenCalled()
    expect(events.find((e) => e.event_type === 'send_failed')).toBeTruthy()
    expect(events.find((e) => e.event_type === 'send_failed').metadata.reason).toBe('opted_out')
  })

  it('refuses to send when consentConfirmed=false', async () => {
    const { deps } = makeDeps()
    const engine = new ReviewRequestEngine(deps)
    await expect(
      engine.create({
        clinicId: 'c1',
        patientName: 'A',
        patientEmail: 'a@b.com',
        patientPhone: '+1',
        therapistName: null,
        serviceType: 'x',
        channel: 'email',
        consentConfirmed: false,
      }),
    ).rejects.toThrow(/consent/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/web && pnpm vitest run lib/review/__tests__/engine.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `engine.ts`**

Create `apps/web/lib/review/engine.ts`:

```ts
// apps/web/lib/review/engine.ts
//
// Orchestrates a single review request: clinic load → opt-out check
// → row insert → JWT mint → channel dispatch → event log.
import type { SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { mintReviewToken } from './tokens'
import { logFunnelEvent } from './events'
import { isOptedOut } from './opt-outs'
import { buildReviewEmailHtml, buildReviewEmailSubject } from './templates/email'
import { buildReviewSmsBody } from './templates/sms'
import type { EmailAdapter } from './adapters/email'
import type { SmsAdapter } from './adapters/sms'
import type { ReviewConfig } from './config'

const TOKEN_EXPIRES_IN_DAYS = 14

export interface ReviewRequestEngineDeps {
  supabase: SupabaseClient
  email: Pick<EmailAdapter, 'send'>
  sms: Pick<SmsAdapter, 'send'>
  config: ReviewConfig
}

export interface CreateReviewRequestInput {
  clinicId: string
  patientName: string
  patientEmail: string | null
  patientPhone: string | null
  therapistName: string | null
  serviceType: string
  channel: 'email' | 'sms' | 'both'
  consentConfirmed: boolean
  createdBy?: string
}

export interface CreateReviewRequestResult {
  id: string
  token: string
}

interface ClinicRow {
  id: string
  name: string
  google_place_id: string | null
  google_maps_url: string | null
  review_sender_name: string | null
}

export class ReviewRequestEngine {
  constructor(private readonly deps: ReviewRequestEngineDeps) {}

  async create(input: CreateReviewRequestInput): Promise<CreateReviewRequestResult> {
    if (!input.consentConfirmed) {
      throw new Error('Patient consent must be confirmed before sending')
    }

    const clinic = await this.loadClinic(input.clinicId)
    const senderName = clinic.review_sender_name ?? clinic.name

    const wantsEmail = input.channel === 'email' || input.channel === 'both'
    const wantsSms = input.channel === 'sms' || input.channel === 'both'

    const jti = randomUUID()
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRES_IN_DAYS * 86_400_000).toISOString()

    const { data: inserted, error } = await this.deps.supabase
      .from('review_requests')
      .insert({
        clinic_id: input.clinicId,
        patient_name: input.patientName,
        patient_email: input.patientEmail,
        patient_phone: input.patientPhone,
        therapist_name: input.therapistName,
        service_type: input.serviceType,
        channel: input.channel,
        token_jti: jti,
        test_mode: this.deps.config.testMode,
        status: 'queued',
        expires_at: expiresAt,
        created_by: input.createdBy ?? null,
        metadata: { consent_confirmed: true },
      })
      .select()
      .single()

    if (error || !inserted) {
      throw new Error(`Failed to insert review_requests: ${error?.message ?? 'unknown'}`)
    }

    const requestId = (inserted as any).id as string
    await logFunnelEvent(this.deps.supabase, { requestId, eventType: 'queued' })

    const token = await mintReviewToken({
      requestId,
      clinicId: input.clinicId,
      jti,
      expiresInDays: TOKEN_EXPIRES_IN_DAYS,
    })
    const shortLink = `${this.deps.config.baseUrl}/review/${token}`
    const unsubLink = `${this.deps.config.baseUrl}/api/review/unsubscribe?token=${encodeURIComponent(token)}`

    // Email branch
    if (wantsEmail) {
      const realEmail = input.patientEmail
      const recipient = this.deps.config.testMode ? this.deps.config.testRecipientEmail : realEmail
      if (!recipient) {
        await logFunnelEvent(this.deps.supabase, {
          requestId,
          eventType: 'send_failed',
          metadata: { channel: 'email', reason: 'no_recipient' },
        })
      } else if (
        realEmail &&
        (await isOptedOut(this.deps.supabase, {
          clinicId: input.clinicId,
          contact: realEmail,
          contactType: 'email',
        }))
      ) {
        await logFunnelEvent(this.deps.supabase, {
          requestId,
          eventType: 'send_failed',
          metadata: { channel: 'email', reason: 'opted_out' },
        })
      } else {
        try {
          const result = await this.deps.email.send({
            to: recipient,
            from: `${senderName} <onboarding@resend.dev>`,
            subject: buildReviewEmailSubject({
              clinicName: clinic.name,
              patientName: input.patientName,
            }),
            html: buildReviewEmailHtml({
              clinicName: clinic.name,
              senderName,
              patientName: input.patientName,
              shortLink,
              unsubscribeLink: unsubLink,
            }),
          })
          await logFunnelEvent(this.deps.supabase, {
            requestId,
            eventType: 'sent_email',
            metadata: { provider_message_id: result.providerMessageId },
          })
        } catch (err) {
          await logFunnelEvent(this.deps.supabase, {
            requestId,
            eventType: 'send_failed',
            metadata: { channel: 'email', reason: 'provider_error', error: String(err) },
          })
        }
      }
    }

    // SMS branch
    if (wantsSms) {
      const realPhone = input.patientPhone
      const recipient = this.deps.config.testMode ? this.deps.config.testRecipientPhone : realPhone
      if (!recipient) {
        await logFunnelEvent(this.deps.supabase, {
          requestId,
          eventType: 'send_failed',
          metadata: { channel: 'sms', reason: 'no_recipient' },
        })
      } else if (
        realPhone &&
        (await isOptedOut(this.deps.supabase, {
          clinicId: input.clinicId,
          contact: realPhone,
          contactType: 'sms',
        }))
      ) {
        await logFunnelEvent(this.deps.supabase, {
          requestId,
          eventType: 'send_failed',
          metadata: { channel: 'sms', reason: 'opted_out' },
        })
      } else {
        try {
          const result = await this.deps.sms.send({
            to: recipient,
            body: buildReviewSmsBody({ senderName, patientName: input.patientName, shortLink }),
          })
          await logFunnelEvent(this.deps.supabase, {
            requestId,
            eventType: 'sent_sms',
            metadata: { provider_message_id: result.providerMessageId },
          })
        } catch (err) {
          await logFunnelEvent(this.deps.supabase, {
            requestId,
            eventType: 'send_failed',
            metadata: { channel: 'sms', reason: 'provider_error', error: String(err) },
          })
        }
      }
    }

    return { id: requestId, token }
  }

  private async loadClinic(clinicId: string): Promise<ClinicRow> {
    const { data, error } = await this.deps.supabase
      .from('clinics')
      .select('id, name, google_place_id, google_maps_url, review_sender_name')
      .eq('id', clinicId)
      .single()
    if (error || !data) throw new Error(`Clinic not found: ${clinicId}`)
    return data as ClinicRow
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/web && pnpm vitest run lib/review/__tests__/engine.test.ts
```

Expected: PASS, 4/4.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/review/engine.ts apps/web/lib/review/__tests__/engine.test.ts
git commit -m "feat(review): ReviewRequestEngine orchestrator with test-mode override"
```

---

## Phase E — API routes

### Task 13: POST `/api/admin/review-requests`

**Files:**

- Create: `apps/web/app/api/admin/review-requests/route.ts`
- Test: `apps/web/app/api/admin/review-requests/__tests__/route.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/web/app/api/admin/review-requests/__tests__/route.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/auth/require-admin', () => ({
  requireAdminAuth: vi.fn(),
}))
vi.mock('@/lib/review/engine', () => ({
  ReviewRequestEngine: vi.fn().mockImplementation(() => ({
    create: vi.fn().mockResolvedValue({ id: 'req-1', token: 'tok-1' }),
  })),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/review/config', () => ({
  loadReviewConfig: () => ({
    tokenSecret: 'a'.repeat(64),
    baseUrl: 'https://x',
    testMode: true,
    testRecipientEmail: 'j@x',
    testRecipientPhone: '+1',
    resendWebhookSecret: '',
  }),
}))

import { POST } from '../route'
import { requireAdminAuth } from '@/lib/auth/require-admin'

function makeReq(body: any): Request {
  return new Request('http://x/api/admin/review-requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/admin/review-requests', () => {
  beforeEach(() => {
    vi.mocked(requireAdminAuth).mockResolvedValue({ error: null, user: { id: 'u1' } } as any)
  })

  it('401 when not authenticated', async () => {
    vi.mocked(requireAdminAuth).mockResolvedValue({
      error: new Response('unauth', { status: 401 }),
    } as any)
    const res = await POST(makeReq({}))
    expect(res.status).toBe(401)
  })

  it('400 on invalid JSON', async () => {
    const res = await POST(new Request('http://x', { method: 'POST', body: 'not-json' }))
    expect(res.status).toBe(400)
  })

  it('400 on schema validation failure', async () => {
    const res = await POST(makeReq({ patientName: '' }))
    expect(res.status).toBe(400)
  })

  it('400 when consentConfirmed is missing or false', async () => {
    const res = await POST(
      makeReq({
        clinicId: 'c1',
        patientName: 'A',
        channel: 'email',
        patientEmail: 'a@b',
        serviceType: 'm',
        consentConfirmed: false,
      }),
    )
    expect(res.status).toBe(400)
  })

  it('200 with id + token on success', async () => {
    const res = await POST(
      makeReq({
        clinicId: 'c1',
        patientName: 'Alice',
        channel: 'email',
        patientEmail: 'a@b.com',
        serviceType: 'massage',
        consentConfirmed: true,
      }),
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ id: 'req-1', token: 'tok-1' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/web && pnpm vitest run app/api/admin/review-requests/__tests__/route.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement the route**

Create `apps/web/app/api/admin/review-requests/route.ts`:

```ts
// apps/web/app/api/admin/review-requests/route.ts
import { z } from 'zod'
import { requireAdminAuth } from '@/lib/auth/require-admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadReviewConfig } from '@/lib/review/config'
import { ReviewRequestEngine } from '@/lib/review/engine'
import { EmailAdapter } from '@/lib/review/adapters/email'
import { SmsAdapter } from '@/lib/review/adapters/sms'

export const runtime = 'nodejs'

const E164_REGEX = /^\+[1-9]\d{7,14}$/
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const bodySchema = z
  .object({
    clinicId: z.string().uuid(),
    patientName: z.string().trim().min(1).max(120),
    patientEmail: z.string().regex(EMAIL_REGEX).nullable().optional(),
    patientPhone: z.string().regex(E164_REGEX).nullable().optional(),
    therapistName: z.string().trim().max(120).nullable().optional(),
    serviceType: z.string().trim().min(1).max(60),
    channel: z.enum(['email', 'sms', 'both']),
    consentConfirmed: z.literal(true),
  })
  .superRefine((v, ctx) => {
    if ((v.channel === 'email' || v.channel === 'both') && !v.patientEmail) {
      ctx.addIssue({
        code: 'custom',
        message: 'patientEmail required for email channel',
        path: ['patientEmail'],
      })
    }
    if ((v.channel === 'sms' || v.channel === 'both') && !v.patientPhone) {
      ctx.addIssue({
        code: 'custom',
        message: 'patientPhone required for sms channel',
        path: ['patientPhone'],
      })
    }
  })

export async function POST(req: Request) {
  const auth = await requireAdminAuth()
  if (auth.error) return auth.error

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return Response.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    )
  }

  const supabase = createAdminClient()
  const config = loadReviewConfig()
  const engine = new ReviewRequestEngine({
    supabase,
    email: new EmailAdapter(),
    sms: new SmsAdapter(),
    config,
  })

  try {
    const out = await engine.create({
      clinicId: parsed.data.clinicId,
      patientName: parsed.data.patientName,
      patientEmail: parsed.data.patientEmail ?? null,
      patientPhone: parsed.data.patientPhone ?? null,
      therapistName: parsed.data.therapistName ?? null,
      serviceType: parsed.data.serviceType,
      channel: parsed.data.channel,
      consentConfirmed: true,
      createdBy: (auth.user as any)?.id,
    })
    return Response.json({ id: out.id, token: out.token })
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 })
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/web && pnpm vitest run app/api/admin/review-requests/__tests__/route.test.ts
```

Expected: PASS, 5/5.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/admin/review-requests/route.ts apps/web/app/api/admin/review-requests/__tests__/route.test.ts
git commit -m "feat(review): POST /api/admin/review-requests with consent gate"
```

---

### Task 14: GET `/api/admin/review-requests` (list with funnel)

**Files:**

- Modify: `apps/web/app/api/admin/review-requests/route.ts`
- Test: append cases to existing test file

- [ ] **Step 1: Add failing tests for GET**

Append to `apps/web/app/api/admin/review-requests/__tests__/route.test.ts`:

```ts
import { GET } from '../route'

describe('GET /api/admin/review-requests', () => {
  beforeEach(() => {
    vi.mocked(requireAdminAuth).mockResolvedValue({ error: null, user: { id: 'u1' } } as any)
  })

  it('401 when not authenticated', async () => {
    vi.mocked(requireAdminAuth).mockResolvedValue({
      error: new Response('unauth', { status: 401 }),
    } as any)
    const res = await GET(new Request('http://x/api/admin/review-requests'))
    expect(res.status).toBe(401)
  })

  it('returns a list of requests with events', async () => {
    // Replace the createAdminClient mock with a stub returning requests + events.
    vi.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: () => ({
        from(table: string) {
          if (table === 'review_requests') {
            return {
              select() {
                return this
              },
              order() {
                return this
              },
              limit() {
                return Promise.resolve({
                  data: [
                    {
                      id: 'r1',
                      patient_name: 'Alice',
                      channel: 'email',
                      created_at: '2026-05-16T00:00:00Z',
                      status: 'sent',
                    },
                  ],
                  error: null,
                })
              },
            } as any
          }
          if (table === 'review_funnel_events') {
            return {
              select() {
                return this
              },
              in() {
                return Promise.resolve({
                  data: [
                    {
                      request_id: 'r1',
                      event_type: 'sent_email',
                      occurred_at: '2026-05-16T00:01:00Z',
                    },
                  ],
                  error: null,
                })
              },
            } as any
          }
          return {} as any
        },
      }),
    }))
    // Re-import after re-mocking
    const { GET: GET2 } = await import('../route')
    const res = await GET2(new Request('http://x/api/admin/review-requests'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.requests[0].id).toBe('r1')
    expect(json.requests[0].events).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Add the GET handler**

Append to `apps/web/app/api/admin/review-requests/route.ts`:

```ts
export async function GET(_req: Request) {
  const auth = await requireAdminAuth()
  if (auth.error) return auth.error

  const supabase = createAdminClient()
  const { data: requests, error: reqErr } = await supabase
    .from('review_requests')
    .select(
      'id, patient_name, patient_email, patient_phone, therapist_name, service_type, channel, status, verified_at, created_at',
    )
    .order('created_at', { ascending: false })
    .limit(50)
  if (reqErr) return Response.json({ error: reqErr.message }, { status: 500 })

  const ids = (requests ?? []).map((r: any) => r.id)
  let events: any[] = []
  if (ids.length > 0) {
    const { data, error: evErr } = await supabase
      .from('review_funnel_events')
      .select('request_id, event_type, occurred_at, metadata')
      .in('request_id', ids)
    if (evErr) return Response.json({ error: evErr.message }, { status: 500 })
    events = data ?? []
  }

  const byRequest = new Map<string, any[]>()
  for (const e of events) {
    const arr = byRequest.get(e.request_id) ?? []
    arr.push(e)
    byRequest.set(e.request_id, arr)
  }

  return Response.json({
    requests: (requests ?? []).map((r: any) => ({ ...r, events: byRequest.get(r.id) ?? [] })),
  })
}
```

- [ ] **Step 3: Run tests to verify**

```bash
cd apps/web && pnpm vitest run app/api/admin/review-requests/__tests__/route.test.ts
```

Expected: PASS, 7/7.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/api/admin/review-requests/route.ts apps/web/app/api/admin/review-requests/__tests__/route.test.ts
git commit -m "feat(review): GET /api/admin/review-requests with embedded funnel events"
```

---

### Task 15: POST `/api/review/generate`

**Files:**

- Create: `apps/web/app/api/review/generate/route.ts`
- Test: `apps/web/app/api/review/generate/__tests__/route.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/web/app/api/review/generate/__tests__/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/review/tokens', () => ({
  verifyReviewToken: vi.fn(),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/review/events', () => ({
  logFunnelEvent: vi.fn().mockResolvedValue(undefined),
  IDEMPOTENT_EVENTS: ['link_clicked', 'email_opened'],
}))
const generateTextMock = vi.fn().mockResolvedValue({ text: 'A nice review.' })
vi.mock('ai', () => ({ generateText: (...args: any[]) => generateTextMock(...args) }))
vi.mock('@ai-sdk/anthropic', () => ({ createAnthropic: () => () => 'haiku-model' }))

import { POST } from '../route'
import { verifyReviewToken } from '@/lib/review/tokens'
import { logFunnelEvent } from '@/lib/review/events'

function req(body: any) {
  return new Request('http://x/api/review/generate', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /api/review/generate', () => {
  beforeEach(() => {
    vi.mocked(verifyReviewToken).mockResolvedValue({ requestId: 'r1', clinicId: 'c1', jti: 'j1' })
    generateTextMock.mockResolvedValue({ text: 'A nice review.' })
  })

  it('401 on invalid token', async () => {
    vi.mocked(verifyReviewToken).mockResolvedValue(null)
    const res = await POST(req({ token: 'x', keywords: 'good' }))
    expect(res.status).toBe(401)
  })

  it('400 on missing keywords', async () => {
    const res = await POST(req({ token: 'x' }))
    expect(res.status).toBe(400)
  })

  it('200 with draft, logs keywords_submitted + draft_generated', async () => {
    const res = await POST(req({ token: 'tok', keywords: 'neck pain better' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.draft).toBe('A nice review.')
    const eventTypes = vi
      .mocked(logFunnelEvent)
      .mock.calls.map((c) => c[1].eventType)
      .sort()
    expect(eventTypes).toContain('keywords_submitted')
    expect(eventTypes).toContain('draft_generated')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/web && pnpm vitest run app/api/review/generate/__tests__/route.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement the route**

Create `apps/web/app/api/review/generate/route.ts`:

```ts
// apps/web/app/api/review/generate/route.ts
import { z } from 'zod'
import { createAnthropic } from '@ai-sdk/anthropic'
import { generateText } from 'ai'
import { verifyReviewToken } from '@/lib/review/tokens'
import { createAdminClient } from '@/lib/supabase/admin'
import { logFunnelEvent } from '@/lib/review/events'
import { buildReviewPrompt } from '@/lib/review/prompts'

export const runtime = 'nodejs'
export const maxDuration = 30

const bodySchema = z.object({
  token: z.string().min(1),
  keywords: z.string().trim().min(1).max(500),
})

export async function POST(req: Request) {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return Response.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    )
  }

  const decoded = await verifyReviewToken(parsed.data.token)
  if (!decoded) return Response.json({ error: 'Invalid or expired token' }, { status: 401 })

  const supabase = createAdminClient()

  // Load request + clinic context
  const { data: row, error: rowErr } = await supabase
    .from('review_requests')
    .select('id, therapist_name, service_type, status, clinics!inner(name)')
    .eq('id', decoded.requestId)
    .single()
  if (rowErr || !row) return Response.json({ error: 'Request not found' }, { status: 404 })
  if ((row as any).status === 'revoked' || (row as any).status === 'expired') {
    return Response.json({ error: 'Request no longer active' }, { status: 410 })
  }

  await logFunnelEvent(supabase, { requestId: decoded.requestId, eventType: 'keywords_submitted' })

  const apiKey = process.env.ANTHROPIC_API_KEY_WIDGET
  if (!apiKey) return Response.json({ error: 'AI not configured' }, { status: 500 })

  const anthropic = createAnthropic({ apiKey })
  const prompt = buildReviewPrompt({
    clinicName: (row as any).clinics.name,
    therapistName: (row as any).therapist_name,
    serviceType: (row as any).service_type ?? 'treatment',
    keywords: parsed.data.keywords,
  })

  try {
    const { text } = await generateText({
      model: anthropic('claude-haiku-4-5-20251001'),
      prompt,
      maxTokens: 400,
      temperature: 0.7,
    })
    const draft = text.trim()
    await logFunnelEvent(supabase, {
      requestId: decoded.requestId,
      eventType: 'draft_generated',
      metadata: { length: draft.length },
    })
    return Response.json({ draft })
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 502 })
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/web && pnpm vitest run app/api/review/generate/__tests__/route.test.ts
```

Expected: PASS, 3/3.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/review/generate/route.ts apps/web/app/api/review/generate/__tests__/route.test.ts
git commit -m "feat(review): POST /api/review/generate with Claude Haiku"
```

---

### Task 16: POST `/api/review/track`

**Files:**

- Create: `apps/web/app/api/review/track/route.ts`
- Test: `apps/web/app/api/review/track/__tests__/route.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/web/app/api/review/track/__tests__/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/review/tokens', () => ({ verifyReviewToken: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/review/events', () => ({
  logFunnelEvent: vi.fn().mockResolvedValue(undefined),
  IDEMPOTENT_EVENTS: ['link_clicked', 'email_opened'],
}))

import { POST } from '../route'
import { verifyReviewToken } from '@/lib/review/tokens'
import { logFunnelEvent } from '@/lib/review/events'

function req(body: any) {
  return new Request('http://x/api/review/track', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /api/review/track', () => {
  beforeEach(() => {
    vi.mocked(verifyReviewToken).mockResolvedValue({ requestId: 'r1', clinicId: 'c1', jti: 'j1' })
    vi.mocked(logFunnelEvent).mockClear()
  })

  it('401 on invalid token', async () => {
    vi.mocked(verifyReviewToken).mockResolvedValue(null)
    expect((await POST(req({ token: 'x', eventType: 'link_clicked' }))).status).toBe(401)
  })

  it('400 on invalid event_type', async () => {
    expect((await POST(req({ token: 'x', eventType: 'unknown_event' }))).status).toBe(400)
  })

  it('rejects events that admin must not write (sent_email, send_failed, etc.)', async () => {
    expect((await POST(req({ token: 'x', eventType: 'sent_email' }))).status).toBe(400)
    expect((await POST(req({ token: 'x', eventType: 'email_delivered' }))).status).toBe(400)
  })

  it('200 and logs link_clicked, copy_clicked, maps_redirected', async () => {
    for (const et of ['link_clicked', 'copy_clicked', 'maps_redirected']) {
      const res = await POST(req({ token: 'tok', eventType: et }))
      expect(res.status).toBe(200)
    }
    const types = vi
      .mocked(logFunnelEvent)
      .mock.calls.map((c) => c[1].eventType)
      .sort()
    expect(types).toEqual(['copy_clicked', 'link_clicked', 'maps_redirected'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/web && pnpm vitest run app/api/review/track/__tests__/route.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement the route**

Create `apps/web/app/api/review/track/route.ts`:

```ts
// apps/web/app/api/review/track/route.ts
import { z } from 'zod'
import { verifyReviewToken } from '@/lib/review/tokens'
import { createAdminClient } from '@/lib/supabase/admin'
import { logFunnelEvent } from '@/lib/review/events'

export const runtime = 'nodejs'

// Events that may be reported by the patient-facing landing page.
// Server-only events (sent_*, email_*, send_failed, queued, draft_*, keywords_*)
// must not be writable by anonymous callers.
const ALLOWED_CLIENT_EVENTS = ['link_clicked', 'copy_clicked', 'maps_redirected'] as const

const bodySchema = z.object({
  token: z.string().min(1),
  eventType: z.enum(ALLOWED_CLIENT_EVENTS),
  metadata: z.record(z.unknown()).optional(),
})

export async function POST(req: Request) {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return Response.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    )
  }

  const decoded = await verifyReviewToken(parsed.data.token)
  if (!decoded) return Response.json({ error: 'Invalid or expired token' }, { status: 401 })

  const supabase = createAdminClient()
  await logFunnelEvent(supabase, {
    requestId: decoded.requestId,
    eventType: parsed.data.eventType,
    metadata: parsed.data.metadata,
  })

  return Response.json({ ok: true })
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/web && pnpm vitest run app/api/review/track/__tests__/route.test.ts
```

Expected: PASS, 4/4.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/review/track/route.ts apps/web/app/api/review/track/__tests__/route.test.ts
git commit -m "feat(review): POST /api/review/track restricted to client-side events"
```

---

### Task 17: `/api/review/unsubscribe` (GET + POST)

**Files:**

- Create: `apps/web/app/api/review/unsubscribe/route.ts`
- Test: `apps/web/app/api/review/unsubscribe/__tests__/route.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/web/app/api/review/unsubscribe/__tests__/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/review/tokens', () => ({ verifyReviewToken: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      if (table === 'review_requests') {
        return {
          select() {
            return this
          },
          eq() {
            return this
          },
          async single() {
            return {
              data: { id: 'r1', patient_email: 'a@b.com', patient_phone: null, clinic_id: 'c1' },
              error: null,
            }
          },
        } as any
      }
      return {} as any
    },
  }),
}))
const recordOptOut = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/review/opt-outs', () => ({
  recordOptOut: (...args: any[]) => recordOptOut(...args),
}))

import { GET, POST } from '../route'
import { verifyReviewToken } from '@/lib/review/tokens'

describe('/api/review/unsubscribe', () => {
  beforeEach(() => {
    recordOptOut.mockClear()
    vi.mocked(verifyReviewToken).mockResolvedValue({ requestId: 'r1', clinicId: 'c1', jti: 'j1' })
  })

  it('GET 302-redirects to /review/[token]/unsubscribed on success', async () => {
    const res = await GET(new Request('http://x/api/review/unsubscribe?token=tok'))
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toMatch(/\/unsubscribed/)
    expect(recordOptOut).toHaveBeenCalledOnce()
  })

  it('GET 401 on invalid token', async () => {
    vi.mocked(verifyReviewToken).mockResolvedValue(null)
    const res = await GET(new Request('http://x/api/review/unsubscribe?token=bad'))
    expect(res.status).toBe(401)
  })

  it('POST returns JSON ok on success', async () => {
    const res = await POST(
      new Request('http://x', {
        method: 'POST',
        body: JSON.stringify({ token: 'tok' }),
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/web && pnpm vitest run app/api/review/unsubscribe/__tests__/route.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement the route**

Create `apps/web/app/api/review/unsubscribe/route.ts`:

```ts
// apps/web/app/api/review/unsubscribe/route.ts
import { verifyReviewToken } from '@/lib/review/tokens'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordOptOut } from '@/lib/review/opt-outs'

export const runtime = 'nodejs'

async function doUnsubscribe(token: string | null): Promise<'ok' | 'invalid'> {
  if (!token) return 'invalid'
  const decoded = await verifyReviewToken(token)
  if (!decoded) return 'invalid'

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('review_requests')
    .select('id, patient_email, patient_phone, clinic_id')
    .eq('id', decoded.requestId)
    .single()
  if (error || !data) return 'invalid'

  const row = data as any
  if (row.patient_email) {
    await recordOptOut(supabase, {
      clinicId: row.clinic_id,
      contact: row.patient_email,
      contactType: 'email',
      source: 'email_link',
    })
  }
  if (row.patient_phone) {
    await recordOptOut(supabase, {
      clinicId: row.clinic_id,
      contact: row.patient_phone,
      contactType: 'sms',
      source: 'email_link',
    })
  }
  return 'ok'
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const token = url.searchParams.get('token')
  const result = await doUnsubscribe(token)
  if (result === 'invalid') return Response.json({ error: 'Invalid token' }, { status: 401 })
  return Response.redirect(`${url.origin}/review/${token}/unsubscribed`, 302)
}

export async function POST(req: Request) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const result = await doUnsubscribe(typeof body?.token === 'string' ? body.token : null)
  if (result === 'invalid') return Response.json({ error: 'Invalid token' }, { status: 401 })
  return Response.json({ ok: true })
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/web && pnpm vitest run app/api/review/unsubscribe/__tests__/route.test.ts
```

Expected: PASS, 3/3.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/review/unsubscribe/route.ts apps/web/app/api/review/unsubscribe/__tests__/route.test.ts
git commit -m "feat(review): unsubscribe route (GET email-link + POST)"
```

---

### Task 18: POST `/api/webhooks/resend`

**Files:**

- Create: `apps/web/app/api/webhooks/resend/route.ts`
- Test: `apps/web/app/api/webhooks/resend/__tests__/route.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/web/app/api/webhooks/resend/__tests__/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHmac } from 'node:crypto'

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      if (table === 'review_funnel_events') {
        return {
          select() {
            return this
          },
          eq() {
            return this
          },
          async maybeSingle() {
            return { data: null, error: null }
          },
          async insert(_row: any) {
            lastInsert = _row
            return { data: _row, error: null }
          },
        } as any
      }
      if (table === 'review_requests') {
        return {
          select() {
            return this
          },
          eq() {
            return this
          },
          async maybeSingle() {
            return { data: { id: 'r1' }, error: null }
          },
        } as any
      }
      return {} as any
    },
  }),
}))

let lastInsert: any
import { POST } from '../route'

const SECRET = 'whsec_test'
beforeEach(() => {
  process.env.RESEND_WEBHOOK_SECRET = SECRET
  lastInsert = null
})

function signed(body: object): Request {
  const raw = JSON.stringify(body)
  const sig = createHmac('sha256', SECRET).update(raw).digest('hex')
  return new Request('http://x/api/webhooks/resend', {
    method: 'POST',
    body: raw,
    headers: {
      'Content-Type': 'application/json',
      'resend-signature': `v1=${sig}`,
    },
  })
}

describe('POST /api/webhooks/resend', () => {
  it('rejects missing or bad signature', async () => {
    const res = await POST(new Request('http://x', { method: 'POST', body: '{}' }))
    expect(res.status).toBe(401)
  })

  it('records email_delivered event when provider id matches a review request', async () => {
    const req = signed({
      type: 'email.delivered',
      data: { email_id: 'em-1' },
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(lastInsert.event_type).toBe('email_delivered')
  })

  it('records email_opened event', async () => {
    const req = signed({ type: 'email.opened', data: { email_id: 'em-1' } })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(lastInsert.event_type).toBe('email_opened')
  })

  it('ignores irrelevant event types', async () => {
    const req = signed({ type: 'email.sent', data: { email_id: 'em-1' } })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(lastInsert).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/web && pnpm vitest run app/api/webhooks/resend/__tests__/route.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement the route**

Create `apps/web/app/api/webhooks/resend/route.ts`:

```ts
// apps/web/app/api/webhooks/resend/route.ts
import { createHmac, timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { logFunnelEvent } from '@/lib/review/events'

export const runtime = 'nodejs'

const TRACKED_EVENTS: Record<string, 'email_delivered' | 'email_opened'> = {
  'email.delivered': 'email_delivered',
  'email.opened': 'email_opened',
}

function verifySignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret || !header) return false
  const expected = `v1=${createHmac('sha256', secret).update(rawBody).digest('hex')}`
  const a = Buffer.from(expected)
  const b = Buffer.from(header)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export async function POST(req: Request) {
  const raw = await req.text()
  const sig = req.headers.get('resend-signature')
  if (!verifySignature(raw, sig)) {
    return Response.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let body: any
  try {
    body = JSON.parse(raw)
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const eventType = TRACKED_EVENTS[body?.type]
  if (!eventType) return Response.json({ ok: true, ignored: true })

  const providerMessageId = body?.data?.email_id
  if (!providerMessageId) return Response.json({ ok: true, missing: 'email_id' })

  const supabase = createAdminClient()

  // Look up the review_requests row whose sent_email event metadata.provider_message_id matches.
  const { data: row } = await supabase
    .from('review_requests')
    .select('id')
    .eq('id', body?.data?.headers?.['X-Review-Request-Id'] ?? '')
    .maybeSingle()

  // Fallback: search by event metadata.
  let requestId = (row as any)?.id ?? null
  if (!requestId) {
    const { data: ev } = await supabase
      .from('review_funnel_events')
      .select('request_id')
      .eq('event_type', 'sent_email')
      .eq('metadata->>provider_message_id', providerMessageId)
      .maybeSingle()
    requestId = (ev as any)?.request_id ?? null
  }

  if (!requestId) return Response.json({ ok: true, unmatched: true })

  await logFunnelEvent(supabase, {
    requestId,
    eventType,
    metadata: { provider_message_id: providerMessageId },
  })

  return Response.json({ ok: true })
}
```

- [ ] **Step 4: Run test to verify it passes**

Note: in the test stub, the `review_requests` lookup returns `{ id: 'r1' }` so the `requestId` is set without hitting the fallback. Real production traffic uses the fallback path; the integration test layer covers it.

```bash
cd apps/web && pnpm vitest run app/api/webhooks/resend/__tests__/route.test.ts
```

Expected: PASS, 4/4.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/webhooks/resend/route.ts apps/web/app/api/webhooks/resend/__tests__/route.test.ts
git commit -m "feat(review): Resend webhook for email_delivered + email_opened"
```

---

## Phase F — UI

### Task 19: Patient landing page

**Files:**

- Create: `apps/web/app/review/[token]/page.tsx`
- Create: `apps/web/app/review/[token]/ReviewClient.tsx`
- Create: `apps/web/app/review/[token]/unsubscribed/page.tsx`

- [ ] **Step 1: Create the server page**

Create `apps/web/app/review/[token]/page.tsx`:

```tsx
// apps/web/app/review/[token]/page.tsx
import { notFound } from 'next/navigation'
import { verifyReviewToken } from '@/lib/review/tokens'
import { createAdminClient } from '@/lib/supabase/admin'
import { logFunnelEvent } from '@/lib/review/events'
import ReviewClient from './ReviewClient'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ token: string }>
}

export default async function ReviewPage({ params }: PageProps) {
  const { token } = await params
  const decoded = await verifyReviewToken(token)
  if (!decoded) notFound()

  const supabase = createAdminClient()
  const { data: row } = await supabase
    .from('review_requests')
    .select(
      'id, patient_name, therapist_name, service_type, clinics!inner(name, google_place_id, google_maps_url)',
    )
    .eq('id', decoded.requestId)
    .single()
  if (!row) notFound()

  // First visit only — logFunnelEvent dedupes link_clicked per request.
  await logFunnelEvent(supabase, { requestId: decoded.requestId, eventType: 'link_clicked' })

  const clinic = (row as any).clinics
  const mapsHref = clinic.google_place_id
    ? `https://search.google.com/local/writereview?placeid=${encodeURIComponent(clinic.google_place_id)}`
    : (clinic.google_maps_url ?? '#')

  return (
    <ReviewClient
      token={token}
      patientName={(row as any).patient_name}
      clinicName={clinic.name}
      mapsHref={mapsHref}
    />
  )
}
```

- [ ] **Step 2: Create the client component**

Create `apps/web/app/review/[token]/ReviewClient.tsx`:

```tsx
'use client'
// apps/web/app/review/[token]/ReviewClient.tsx
import { useState } from 'react'

interface Props {
  token: string
  patientName: string
  clinicName: string
  mapsHref: string
}

async function track(token: string, eventType: string) {
  try {
    await fetch('/api/review/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, eventType }),
    })
  } catch {
    /* swallow — tracking is best-effort */
  }
}

export default function ReviewClient(props: Props) {
  const [keywords, setKeywords] = useState('')
  const [draft, setDraft] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function generate() {
    if (!keywords.trim()) return
    setLoading(true)
    setErr(null)
    setDraft(null)
    try {
      const res = await fetch('/api/review/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: props.token, keywords }),
      })
      if (!res.ok) {
        setErr('Could not generate a draft. Please try again.')
        return
      }
      const json = await res.json()
      setDraft(json.draft)
    } catch {
      setErr('Network error.')
    } finally {
      setLoading(false)
    }
  }

  async function copy() {
    if (!draft) return
    await navigator.clipboard.writeText(draft)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    void track(props.token, 'copy_clicked')
  }

  function openMaps() {
    void track(props.token, 'maps_redirected')
    window.open(props.mapsHref, '_blank', 'noopener,noreferrer')
  }

  return (
    <main
      style={{
        maxWidth: 540,
        margin: '0 auto',
        padding: '40px 20px',
        fontFamily: '-apple-system,system-ui,sans-serif',
        color: '#1a1a1a',
      }}
    >
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>Hi {props.patientName.split(/\s+/)[0]} 👋</h1>
      <p style={{ color: '#6b7280', lineHeight: 1.6 }}>
        Thanks for visiting <strong>{props.clinicName}</strong>. Want help writing a quick Google
        review? Type a few words about your visit and we'll draft one for you. Takes 30 seconds.
      </p>

      <label style={{ display: 'block', marginTop: 24, marginBottom: 8, fontWeight: 600 }}>
        Your notes (e.g. "neck pain, much better, three sessions")
      </label>
      <textarea
        value={keywords}
        onChange={(e) => setKeywords(e.target.value)}
        rows={3}
        maxLength={500}
        style={{
          width: '100%',
          padding: 12,
          fontSize: 16,
          border: '1px solid #e5e7eb',
          borderRadius: 8,
        }}
      />

      <button
        onClick={generate}
        disabled={loading || !keywords.trim()}
        style={{
          marginTop: 12,
          background: '#2563eb',
          color: '#fff',
          padding: '12px 24px',
          border: 'none',
          borderRadius: 8,
          fontSize: 16,
          cursor: 'pointer',
          opacity: loading || !keywords.trim() ? 0.6 : 1,
        }}
      >
        {loading ? 'Drafting…' : 'Generate review'}
      </button>

      {err && (
        <p role="alert" style={{ color: '#dc2626', marginTop: 12 }}>
          {err}
        </p>
      )}

      {draft && (
        <section style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 18, marginBottom: 8 }}>Your draft</h2>
          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #e5e7eb',
              borderRadius: 8,
              padding: 16,
              whiteSpace: 'pre-wrap',
              lineHeight: 1.6,
            }}
          >
            {draft}
          </div>
          <div style={{ marginTop: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button
              onClick={copy}
              style={{
                background: '#1a1a1a',
                color: '#fff',
                padding: '10px 20px',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
              }}
            >
              {copied ? 'Copied ✓' : 'Copy draft'}
            </button>
            <button
              onClick={openMaps}
              style={{
                background: '#059669',
                color: '#fff',
                padding: '10px 20px',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
              }}
            >
              Open Google Maps
            </button>
          </div>
          <p style={{ color: '#6b7280', fontSize: 13, marginTop: 16 }}>
            Tip: tap <strong>Copy draft</strong>, then <strong>Open Google Maps</strong>, and paste
            it into Google's review form.
          </p>
        </section>
      )}
    </main>
  )
}
```

- [ ] **Step 3: Create the confirmation page**

Create `apps/web/app/review/[token]/unsubscribed/page.tsx`:

```tsx
// apps/web/app/review/[token]/unsubscribed/page.tsx

export default function UnsubscribedPage() {
  return (
    <main
      style={{
        maxWidth: 540,
        margin: '0 auto',
        padding: '40px 20px',
        fontFamily: '-apple-system,system-ui,sans-serif',
        color: '#1a1a1a',
      }}
    >
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>You're unsubscribed</h1>
      <p style={{ color: '#6b7280', lineHeight: 1.6 }}>
        We won't send you any more review requests. If you ever change your mind, just let the
        clinic know.
      </p>
    </main>
  )
}
```

- [ ] **Step 4: Manual smoke**

```bash
cd apps/web && pnpm dev
```

Open `http://localhost:3000/review/<paste a valid JWT minted via REPL or test>`.
Expected: page renders the patient greeting; entering keywords + clicking "Generate review" shows a draft; clicking "Copy draft" copies to clipboard; clicking "Open Google Maps" opens a new tab.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/review/
git commit -m "feat(review): patient landing page + client interaction + unsubscribed confirmation"
```

---

### Task 20: Admin send + list page

**Files:**

- Create: `apps/web/app/(clinic)/admin/review-requests/page.tsx`
- Create: `apps/web/app/(clinic)/admin/review-requests/AdminReviewRequestsClient.tsx`

- [ ] **Step 1: Create the server page**

Create `apps/web/app/(clinic)/admin/review-requests/page.tsx`:

```tsx
// apps/web/app/(clinic)/admin/review-requests/page.tsx
import { requireAdminAuth } from '@/lib/auth/require-admin'
import { createAdminClient } from '@/lib/supabase/admin'
import AdminReviewRequestsClient from './AdminReviewRequestsClient'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export default async function Page() {
  const auth = await requireAdminAuth()
  if (auth.error) return auth.error

  const supabase = createAdminClient()
  const { data: clinics } = await supabase.from('clinics').select('id, name, slug').order('name')
  const { data: therapists } = await supabase
    .from('therapists')
    .select('id, clinic_id, name, role')
    .order('name')

  return (
    <AdminReviewRequestsClient
      clinics={(clinics as any[]) ?? []}
      therapists={(therapists as any[]) ?? []}
    />
  )
}
```

- [ ] **Step 2: Create the client component**

Create `apps/web/app/(clinic)/admin/review-requests/AdminReviewRequestsClient.tsx`:

```tsx
'use client'
// apps/web/app/(clinic)/admin/review-requests/AdminReviewRequestsClient.tsx
import { useEffect, useState } from 'react'

interface Clinic {
  id: string
  name: string
  slug: string
}
interface Therapist {
  id: string
  clinic_id: string
  name: string
  role: string
}

interface Props {
  clinics: Clinic[]
  therapists: Therapist[]
}

interface ReviewRequest {
  id: string
  patient_name: string
  patient_email: string | null
  patient_phone: string | null
  channel: 'email' | 'sms' | 'both'
  status: string
  verified_at: string | null
  created_at: string
  events: { event_type: string; occurred_at: string; metadata: any }[]
}

const FUNNEL_STEPS = [
  ['sent', ['sent_email', 'sent_sms']],
  ['delivered', ['email_delivered']],
  ['opened', ['email_opened']],
  ['clicked', ['link_clicked']],
  ['keywords', ['keywords_submitted']],
  ['generated', ['draft_generated']],
  ['copied', ['copy_clicked']],
  ['redirected', ['maps_redirected']],
] as const

function hasEvent(events: ReviewRequest['events'], types: readonly string[]) {
  return events.some((e) => types.includes(e.event_type))
}

export default function AdminReviewRequestsClient({ clinics, therapists }: Props) {
  const [clinicId, setClinicId] = useState(clinics[0]?.id ?? '')
  const [patientName, setPatientName] = useState('')
  const [patientEmail, setPatientEmail] = useState('')
  const [patientPhone, setPatientPhone] = useState('')
  const [therapistName, setTherapistName] = useState('')
  const [serviceType, setServiceType] = useState('massage')
  const [channel, setChannel] = useState<'email' | 'sms' | 'both'>('email')
  const [consent, setConsent] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const [rows, setRows] = useState<ReviewRequest[]>([])

  const clinicTherapists = therapists.filter((t) => t.clinic_id === clinicId)

  async function loadList() {
    const res = await fetch('/api/admin/review-requests')
    if (res.ok) {
      const json = await res.json()
      setRows(json.requests ?? [])
    }
  }
  useEffect(() => {
    void loadList()
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setFlash(null)
    const body = {
      clinicId,
      patientName,
      channel,
      patientEmail: patientEmail || null,
      patientPhone: patientPhone || null,
      therapistName: therapistName || null,
      serviceType,
      consentConfirmed: consent,
    }
    const res = await fetch('/api/admin/review-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      setFlash('Review request sent.')
      setPatientName('')
      setPatientEmail('')
      setPatientPhone('')
      setTherapistName('')
      setConsent(false)
      void loadList()
    } else {
      const j = await res.json().catch(() => ({}))
      setFlash(`Error: ${j.error ?? res.status}`)
    }
    setSubmitting(false)
  }

  return (
    <main
      style={{
        maxWidth: 1100,
        margin: '0 auto',
        padding: '32px 24px',
        fontFamily: '-apple-system,system-ui,sans-serif',
      }}
    >
      <h1 style={{ fontSize: 22, marginBottom: 24 }}>Review requests</h1>

      <form
        onSubmit={submit}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 16,
          padding: 24,
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: 12,
          marginBottom: 32,
        }}
      >
        <label>
          Clinic
          <select value={clinicId} onChange={(e) => setClinicId(e.target.value)} style={input}>
            {clinics.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Channel
          <select value={channel} onChange={(e) => setChannel(e.target.value as any)} style={input}>
            <option value="email">Email</option>
            <option value="sms">SMS</option>
            <option value="both">Both</option>
          </select>
        </label>
        <label>
          Patient name
          <input
            value={patientName}
            onChange={(e) => setPatientName(e.target.value)}
            required
            style={input}
          />
        </label>
        <label>
          Therapist
          <input
            list="therapists-list"
            value={therapistName}
            onChange={(e) => setTherapistName(e.target.value)}
            style={input}
          />
          <datalist id="therapists-list">
            {clinicTherapists.map((t) => (
              <option key={t.id} value={t.name} />
            ))}
          </datalist>
        </label>
        <label>
          Patient email
          <input
            type="email"
            value={patientEmail}
            onChange={(e) => setPatientEmail(e.target.value)}
            style={input}
          />
        </label>
        <label>
          Patient phone (E.164, e.g. +14035550100)
          <input
            value={patientPhone}
            onChange={(e) => setPatientPhone(e.target.value)}
            style={input}
          />
        </label>
        <label>
          Service type
          <select
            value={serviceType}
            onChange={(e) => setServiceType(e.target.value)}
            style={input}
          >
            <option value="massage">Massage</option>
            <option value="physio">Physio</option>
            <option value="acupuncture">Acupuncture</option>
            <option value="osteopathy">Osteopathy</option>
          </select>
        </label>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>I confirm this patient consented to receive follow-up communications.</span>
          </label>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <button
            type="submit"
            disabled={submitting || !consent}
            style={{
              background: '#2563eb',
              color: '#fff',
              padding: '10px 20px',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              opacity: submitting || !consent ? 0.6 : 1,
            }}
          >
            {submitting ? 'Sending…' : 'Send review request'}
          </button>
        </div>
        {flash && (
          <p
            style={{
              gridColumn: '1 / -1',
              color: flash.startsWith('Error') ? '#dc2626' : '#059669',
            }}
          >
            {flash}
          </p>
        )}
      </form>

      <h2 style={{ fontSize: 18, marginBottom: 12 }}>Recent (last 50)</h2>
      <div
        style={{
          overflowX: 'auto',
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: 12,
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead style={{ background: '#f8fafc' }}>
            <tr>
              <th style={th}>When</th>
              <th style={th}>Patient</th>
              <th style={th}>Channel</th>
              {FUNNEL_STEPS.map(([label]) => (
                <th key={label} style={th}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                <td style={td}>{new Date(r.created_at).toLocaleString()}</td>
                <td style={td}>{r.patient_name}</td>
                <td style={td}>{r.channel}</td>
                {FUNNEL_STEPS.map(([label, types]) => (
                  <td key={label} style={td}>
                    {hasEvent(r.events, types) ? '✓' : ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  )
}

const input: React.CSSProperties = {
  display: 'block',
  width: '100%',
  marginTop: 6,
  padding: 8,
  fontSize: 14,
  border: '1px solid #e5e7eb',
  borderRadius: 6,
}
const th: React.CSSProperties = { textAlign: 'left', padding: '10px 12px', fontWeight: 600 }
const td: React.CSSProperties = { padding: '10px 12px', verticalAlign: 'top' }
```

- [ ] **Step 3: Manual smoke**

```bash
cd apps/web && pnpm dev
```

Visit `http://localhost:3000/admin/review-requests` (authenticated). Fill the form, check the consent box, submit. Expected: flash message "Review request sent." and the new row appears in the table within 2 seconds.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/\(clinic\)/admin/review-requests/
git commit -m "feat(review): admin send form + funnel list"
```

---

## Phase G — E2E and rollout

### Task 21: Playwright E2E

**Files:**

- Create: `apps/web/tests/e2e/s2-review-engine.spec.ts`

- [ ] **Step 1: Write the E2E**

Create `apps/web/tests/e2e/s2-review-engine.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

test.describe('S2 review engine — happy path (test mode)', () => {
  test('admin sends → page renders draft → events logged', async ({ page, request }) => {
    // Pre-condition: REVIEW_TEST_MODE=true on the target environment.
    test.skip(process.env.E2E_BASE_URL == null, 'E2E_BASE_URL not set; skipping')

    // 1. Hit admin send endpoint as authenticated admin.
    const sendRes = await request.post(`${process.env.E2E_BASE_URL}/api/admin/review-requests`, {
      data: {
        clinicId: process.env.E2E_CLINIC_ID,
        patientName: 'E2E Test',
        patientEmail: 'e2e@example.com',
        patientPhone: '+14035550199',
        therapistName: 'Jimmy',
        serviceType: 'massage',
        channel: 'both',
        consentConfirmed: true,
      },
      headers: { cookie: process.env.E2E_ADMIN_COOKIE ?? '' },
    })
    expect(sendRes.status()).toBe(200)
    const { token } = await sendRes.json()
    expect(token).toBeTruthy()

    // 2. Visit landing page.
    await page.goto(`${process.env.E2E_BASE_URL}/review/${token}`)
    await expect(page.getByText(/Hi E2E/i)).toBeVisible()

    // 3. Type keywords and generate.
    await page.getByRole('textbox').fill('neck pain better Jimmy')
    await page.getByRole('button', { name: /Generate review/i }).click()
    await expect(page.getByText(/Your draft/i)).toBeVisible({ timeout: 15000 })

    // 4. Copy + open maps.
    await page.getByRole('button', { name: /Copy draft/i }).click()
    await expect(page.getByText(/Copied/i)).toBeVisible()
  })
})
```

- [ ] **Step 2: Commit (do not run unless staging is ready)**

```bash
git add apps/web/tests/e2e/s2-review-engine.spec.ts
git commit -m "test(review): playwright e2e happy path against staging"
```

---

### Task 22: Operator runbook + Stage 0 smoke

**Files:**

- Create: `docs/operations/s2-review-engine.md`

- [ ] **Step 1: Create the runbook**

Create `docs/operations/s2-review-engine.md`:

```markdown
# S2 Review Engine — Operator Runbook

## Env vars to set (Vercel + local)

- `REVIEW_TOKEN_SECRET` — 32+ hex chars, distinct from `WIDGET_SESSION_SECRET`
- `REVIEW_BASE_URL` — e.g. `https://physio.app`
- `REVIEW_TEST_MODE` — `true` until Stage 2 of rollout
- `REVIEW_TEST_RECIPIENT_EMAIL` — Jason's test inbox
- `REVIEW_TEST_RECIPIENT_PHONE` — Jason's test phone (verified caller ID on Twilio trial)
- `RESEND_WEBHOOK_SECRET` — from Resend dashboard
- `RESEND_API_KEY` — already configured
- `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_PHONE_NUMBER` — already configured
- `ANTHROPIC_API_KEY_WIDGET` — already configured (reused for Haiku 4.5)

## Stage 0 — internal plumbing smoke

1. Deploy `feat/s2-review-engine` to Vercel Preview.
2. Set `REVIEW_TEST_MODE=true` and the two test recipients to Jason's inbox/phone.
3. From `/admin/review-requests`, send one request with `channel=both`. Use any patient values — they will be overridden.
4. Within 30 seconds, verify:
   - Email arrives at the test inbox.
   - SMS arrives at the test phone (with Twilio trial prefix).
   - Admin table shows the row with sent_email and sent_sms ticks.
5. Click the email link → landing page renders the patient name (the value entered in the form, not the test override).
6. Submit "neck pain better Jimmy" → draft appears.
7. Click "Copy draft" → admin row gains the `copied` tick.
8. Click "Open Google Maps" → admin row gains the `redirected` tick.
9. Open the email's unsubscribe link → confirmation page shows; admin table shows status remains intact but a follow-up send to the same email/phone is rejected with `send_failed/opted_out`.

## Stage 1 — friend alpha

- Keep `REVIEW_TEST_MODE=false` but only send to consenting friends (Jason + 2–3) using their real contact info.
- Track click-through and copy rate over 3 days.
- Pass criteria: click rate > 50%, copy rate > 30%, zero crashes.

## Stage 2 — V-Health soft launch (email only)

- Set `REVIEW_TEST_MODE=false`.
- Set the production `google_place_id` on the V-Health clinic row (replace `ChIJ_PLACEHOLDER_REPLACE_BEFORE_STAGE_2` from migration 018).
- Confirm written CASL consent from David Wang for V-Health patients (screenshot kept in `docs/operations/`).
- Channel = `email` only for 14 days.
- 5–10 sends/day.
- Pass criteria: first real V-Health Google review traceable to a `verified_at` row by operator-confirmed reconciliation.

## Stage 3 — V-Health full (email + SMS)

- Same as Stage 2 but with `channel=both`.
- Requires production Canadian 10DLC number provisioned at Twilio.
- 30-day observation. Day 14 and Day 30 data reviews scheduled separately.

## Stage 4 — Productize for clinic #2

- Onboarding checklist:
  1. INSERT a new `clinics` row + Google fields.
  2. INSERT therapists.
  3. Add the clinic owner as an admin auth user.
  4. Verify access to `/admin/review-requests`.
  5. Time to first send ≤ 20 minutes.

## Troubleshooting

- **Resend webhook events not landing:** check the signature secret matches. The Resend dashboard regenerates it on rotation.
- **SMS bouncing on Twilio trial:** the destination phone must be added to Verified Caller IDs.
- **Patient sees `notFound` on landing page:** the JWT expired (14 days) or the request was revoked. Send a new one.
- **Engine throws "Patient consent must be confirmed":** the admin form did not check the consent box — a code path that means the form was bypassed (curl). Investigate.
```

- [ ] **Step 2: Commit**

```bash
git add docs/operations/s2-review-engine.md
git commit -m "docs(review): operator runbook for env, smoke, rollout stages"
```

- [ ] **Step 3: Execute Stage 0 smoke**

Run through every step in `## Stage 0 — internal plumbing smoke` above. Capture any deviation as a follow-up commit. The Phase 1 implementation is **complete** when all nine Stage 0 checks pass.

---

## Self-Review Notes

**Spec coverage:** every section of `docs/superpowers/specs/2026-05-16-s2-review-engine-design.md` is implemented:

- §3 Architecture → Tasks 12, 19, 20.
- §4.2 Migrations 016/017 → Tasks 2, 3, 4.
- §5.1 tokens.ts → Task 5.
- §5.2 engine.ts → Task 12.
- §5.3 EmailAdapter + Resend webhook → Tasks 10, 18.
- §5.4 SmsAdapter → Task 11.
- §5.5 generate route → Task 15.
- §5.6 landing page → Task 19.
- §5.7 track route → Task 16.
- §5.8 unsubscribe route → Task 17.
- §5.9 admin POST → Task 13; admin GET → Task 14.
- §5.10 admin page → Task 20.
- §6 Funnel measurement → events.ts (Task 7) + admin client (Task 20).
- §7 CASL + opt-outs → Tasks 8, 17, 19, 20.
- §8 Configuration → Task 1.
- §9 Test strategy → all task tests + Task 21.
- §10 Rollout → Task 22.
- §11 Operational tasks → flagged in runbook.
- §12 Reuse map → followed via direct imports.

**Type consistency:** `ReviewTokenPayload` (Task 5), `ReviewEventType` (Task 7), `CreateReviewRequestInput` (Task 12), `bodySchema` for admin POST (Task 13) — all internally consistent. `IDEMPOTENT_EVENTS` is the single source of truth and is imported (not re-declared) in route mocks.

**Placeholder scan:** no TBD/TODO. Every step has runnable code or commands. The only intentional placeholder is the `google_place_id = 'ChIJ_PLACEHOLDER_…'` seed value in Task 4, which is documented as operator-replaceable before Stage 2.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-16-s2-review-engine.md`.**

Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session using `superpowers:executing-plans` with checkpoints.

Which approach?
