# Phase 1 — Voice Intake + On-Site Review MVP

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the full loop — therapist voice memo → structured 5-field record → therapist dashboard → Google review nudge — works end-to-end on David's iPhone before the May 20 demo.

**Architecture:** A Telegram bot on the existing OpenClaw VPS forwards audio to a new Next.js webhook endpoint; the endpoint calls OpenAI Whisper for transcription and Claude for 5-field extraction, then persists an `intake_records` row in Supabase. A fallback in-app MediaRecorder path on `/staff/intake` does the same work without the bot if the May 13 spike fails. The existing `/dashboard` shell gains an `/dashboard/intake` list + detail view with server-side PDF via `window.print()`. A standalone public page at `/review` (no auth, QR-accessible) calls Claude to draft Google reviews.

**Tech Stack:** Next.js 16 App Router, Supabase (PostgreSQL + RLS), `@supabase/ssr`, Vercel AI SDK v6 (`@ai-sdk/anthropic`, `@ai-sdk/openai`, `ai`), OpenAI Whisper via `experimental_transcribe`, Telegram Bot API (webhook mode), `window.print()` + print CSS for PDF, existing shadcn/ui + Tailwind v4, pnpm + Turborepo.

---

## Locked Decisions (post-plan, 2026-05-05)

The 4 open questions from the original plan have been resolved by Jason. **These overrides take priority over any contradictory detail in the body of this plan.**

| # | Open question | Locked answer | Implication for the build |
|---|---|---|---|
| 1 | OpenClaw VPS runtime — Python or Node? | **Node** | Telegram bot script in Task 3 must be rewritten in Node (e.g., `node-telegram-bot-api` or `telegraf`). Replace any Python `python-telegram-bot` references in the original plan body. |
| 2 | V-Health Google Maps Place ID for the `/review` page | **Verified data** below; ship the **short-link path** for May 19 demo, upgrade to ChIJ-Place-ID-via-Places-API in W3 (Phase 2 build). | `/review` page's "Open Google Maps to post" button links to `https://maps.app.goo.gl/vXTsKso2phwUaFG87` for May 19. No GCP API key needed for Phase 1. |
| 3 | David's Supabase Auth account | **Jason provisions on his side. David never sees an auth setup screen.** | Auth UX must be **magic-link / passwordless only** — David should never need to remember a password. Use Supabase Auth's email magic-link flow. |
| 4 | `zod` runtime dep in `packages/shared/package.json` | **Confirmed present.** | No action — proceed. |

### V-Health Google Maps reference data (verified 2026-05-05 from V-Health's own website)

- **Canonical short link** (use as `VHEALTH_GOOGLE_MAPS_REVIEW_URL` env var for Phase 1):
  `https://maps.app.goo.gl/vXTsKso2phwUaFG87`
- **Coords:** `51.1039407, -114.1653804`
- **Hex FID:** `0x53716fb68624f98f:0x28a4d4b598f21782`
- **CID (decimal):** `2928699534117836674`
- **Knowledge-Graph ID:** `g/11xrbx8h1t`
- **ChIJ Place ID:** ⚠️ NOT YET RESOLVED — needs a one-shot Google Places Details API call in Phase 2 (W3) to upgrade `/review` from short-link to true 1-click `https://search.google.com/local/writereview?placeid={CHIJ}`.

### Phase 1 = "1 extra tap" UX is acceptable
The May 19 demo flow ends with the patient tapping "Open in Google Maps" → landing on V-Health's Maps page → tapping "Write a review" → AI-drafted text in clipboard ready to paste. That's one extra tap vs. the eventual 1-click flow. Demo-acceptable. The seamless flow is W3 work, not W2.

---

## Testing & Isolation Protocol (CRITICAL — read before writing code)

**Hard rule:** No test traffic — voice memos, AI drafts, review submissions — may touch V-Health's real Google Maps listing during development. Posting fake reviews to a real business is reputationally and legally damaging. The entire stack must be environment-aware from day one.

### Environment isolation matrix

| Concern | Local dev / Vercel preview | Production |
|---|---|---|
| **Google review URL** (`VHEALTH_GOOGLE_MAPS_REVIEW_URL`) | `${NEXT_PUBLIC_APP_URL}/review/test-success` — stub page that displays "Would have opened Google Maps with text: {draft}" + a Copy button. Zero contact with Google. | `https://maps.app.goo.gl/vXTsKso2phwUaFG87` (V-Health) |
| **Telegram bot** | Separate dev bot (e.g., `@physioos_dev_bot`) with webhook pointing at Vercel preview URL or local `ngrok` tunnel | Production bot pointing at production webhook |
| **Whisper / Claude APIs** | Real APIs (no sandbox available). Use **fake patient names** in test voice memos ("Patient John Doe, treated knee, did stretching"). Cost is pennies. | Same APIs, real therapist input |
| **Supabase** | Local Supabase stack via `pnpm supabase start` — fully isolated DB and auth | Hosted Supabase project |
| **OpenClaw VPS endpoint** | Stand up a separate `/dev-webhook` path on the same VPS so it does not share state with `/webhook` (prod) | `/webhook` |
| **PDF export, dashboard, magic-link auth** | All work end-to-end against local Supabase | All work end-to-end against hosted Supabase |

### Runtime gating switch

In `/review` and any other code that uses `VHEALTH_GOOGLE_MAPS_REVIEW_URL`:

```ts
const isProd = process.env.VERCEL_ENV === 'production';
const reviewUrl = process.env.VHEALTH_GOOGLE_MAPS_REVIEW_URL!;
// In non-prod, render a yellow "TEST MODE — would post to {prod URL}" banner above the action button
```

The banner is non-negotiable in non-prod environments. Make accidental review-posting in dev visually impossible.

### What this protocol proves WITHOUT touching V-Health's real listing

1. Whisper transcribes physio-jargon voice memos accurately
2. Claude extracts the 5 intake fields correctly from the transcript
3. Telegram bot → OpenClaw VPS → Vercel webhook → DB row works end-to-end
4. Dashboard list / detail / PDF export works on real test data
5. AI review draft generation works (the draft is generated; just not posted anywhere)
6. Magic-link auth flow works for David's email

Only **step 7 — actually posting a review on V-Health's Google profile** requires production. That is literally one tap (open Google Maps, paste from clipboard, hit Post). No code path involved.

### May 20 demo protocol

On the May 20 demo with David:
- Use the **production** deployment, real V-Health URL, real Telegram bot
- Show the full flow: voice intake → dashboard → PDF → review draft generation → "Open in Google Maps" tap
- **STOP one tap before actually posting.** Show David the drafted review in the clipboard with Google Maps open and the review form pre-loaded — then say: *"when a real patient does this after a real visit, that's a real Google review."*
- This preserves trust-building and avoids posting any fake review on his real profile.

### Required env vars (per environment)

`apps/web/.env.local` (dev):
```
VHEALTH_GOOGLE_MAPS_REVIEW_URL=http://localhost:3000/review/test-success
TELEGRAM_BOT_TOKEN=<dev_bot_token>
OPENCLAW_VPS_WEBHOOK_PATH=/dev-webhook
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Vercel production:
```
VHEALTH_GOOGLE_MAPS_REVIEW_URL=https://maps.app.goo.gl/vXTsKso2phwUaFG87
TELEGRAM_BOT_TOKEN=<prod_bot_token>
OPENCLAW_VPS_WEBHOOK_PATH=/webhook
NEXT_PUBLIC_APP_URL=https://<production-domain>
```

### Test stub: `/review/test-success` page

Implement this as part of Task 9 (AI Review Assistant page). One-screen page that:
- Displays the AI-drafted review text in a styled box
- Shows the simulated Google review URL it WOULD have opened
- Has a "Copy" button
- Has a top banner: "TEST MODE — no real review was posted"

This page also doubles as the Vercel preview deployment landing for any QA / PR review.

---

## Scope Check

This plan covers five distinct subsystems:

| Subsystem | Tasks |
|---|---|
| T1–T2 | DB migration + shared types |
| T3 | Telegram spike + go/no-go |
| T4 | Voice pipeline — Path A (Telegram → OpenClaw VPS webhook → Whisper → Claude → DB) |
| T5 | Voice pipeline — Path B fallback (in-app MediaRecorder → server API → Whisper → Claude → DB) |
| T6 | 5-field manual intake form (manual fallback for any entry) |
| T7 | Therapist dashboard — intake list + detail view |
| T8 | PDF export (print stylesheet) |
| T9 | AI Review Assistant page (`/review`) |
| T10 | Demo seed data + end-to-end run-through |

Each task produces working, testable output on its own.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│  PATH A — Telegram-first (primary if spike passes)                  │
│                                                                     │
│  Therapist → Telegram voice memo                                    │
│       │                                                             │
│       ▼                                                             │
│  OpenClaw VPS  (Node/Python script)                                 │
│    • receives Telegram bot webhook                                  │
│    • downloads voice file from Telegram                             │
│    • POSTs multipart audio to physio-os Vercel                      │
│       │                                                             │
│       ▼                                                             │
│  POST /api/intake/telegram-webhook   (Next.js API route)            │
│    • verifies WEBHOOK_SECRET header                                 │
│    • calls OpenAI Whisper → transcript                              │
│    • calls Claude via AI SDK → 5-field JSON                         │
│    • upserts intake_records row via service-role Supabase client    │
│    • returns 200 + confirmation JSON                                │
│       │                                                             │
│       ▼                                                             │
│  OpenClaw VPS sends confirmation message back to therapist          │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  PATH B — In-app MediaRecorder fallback                             │
│                                                                     │
│  Therapist → /staff/intake (Next.js page, authenticated)            │
│    • MediaRecorder captures audio blob                              │
│    • fetch POST /api/intake/upload (FormData, audio/webm)           │
│       │                                                             │
│       ▼                                                             │
│  POST /api/intake/upload   (Next.js API route)                      │
│    • calls OpenAI Whisper → transcript                              │
│    • calls Claude → 5-field JSON                                    │
│    • returns { fields } (does NOT save yet)                         │
│       │                                                             │
│       ▼                                                             │
│  Client pre-fills form fields, therapist reviews + submits          │
│  POST /api/intake/save  → upserts intake_records row                │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  THERAPIST DASHBOARD                                                │
│                                                                     │
│  GET /dashboard/intake  (server component, auth-gated)             │
│    • list view: date | patient | therapist | area | notes preview  │
│    • each row: "View / Export PDF" link                             │
│                                                                     │
│  GET /dashboard/intake/[id]  (server component)                    │
│    • full record detail                                             │
│    • "Print / Download PDF" button → triggers window.print()       │
│    • print CSS stylesheet hides sidebar, header, nav button        │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  AI REVIEW ASSISTANT — public, no auth                              │
│                                                                     │
│  GET /review  (client component — no auth, QR-accessible)          │
│    • single text field + Submit                                     │
│    • POST /api/review/generate → Claude → 3-sentence draft         │
│    • Copy button + Google Maps link displayed                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## File Map

### New files to create

| File | Responsibility |
|---|---|
| `supabase/migrations/016_intake_records.sql` | New `intake_records` table + RLS policies |
| `packages/shared/src/intake.types.ts` | Shared `IntakeRecord` and `IntakeFields` TypeScript types |
| `apps/web/app/api/intake/telegram-webhook/route.ts` | Receives forwarded audio from OpenClaw VPS, runs Whisper + Claude, saves record |
| `apps/web/app/api/intake/upload/route.ts` | Receives raw audio from browser MediaRecorder, runs Whisper + Claude, returns pre-filled fields |
| `apps/web/app/api/intake/save/route.ts` | Saves a confirmed IntakeFields object to DB (used by Path B form) |
| `apps/web/app/api/review/generate/route.ts` | Claude API call → Google review draft |
| `apps/web/app/(clinic)/dashboard/intake/page.tsx` | Server component: intake record list view |
| `apps/web/app/(clinic)/dashboard/intake/[id]/page.tsx` | Server component: record detail + print view |
| `apps/web/app/(clinic)/dashboard/intake/intake-list.tsx` | Client component: list table with print button |
| `apps/web/app/(clinic)/dashboard/intake/intake-detail.tsx` | Client component: record detail card + print trigger |
| `apps/web/app/(clinic)/dashboard/intake/print.css` | Print stylesheet: hides chrome, formats record cleanly |
| `apps/web/app/staff/intake/page.tsx` | Auth-gated Path B intake page (MediaRecorder + pre-fill form) |
| `apps/web/app/staff/intake/intake-form.tsx` | Client component: MediaRecorder UI + 5-field form |
| `apps/web/app/review/page.tsx` | Public review assistant page (no auth) |
| `apps/web/app/review/review-assistant.tsx` | Client component: text field + generate + copy |
| `apps/web/lib/intake/whisper.ts` | Whisper transcription helper (wraps openai SDK) |
| `apps/web/lib/intake/extract.ts` | Claude extraction helper → IntakeFields |
| `apps/web/lib/intake/db.ts` | Supabase insert helper for intake_records |
| `docs/spike/path-a-outcome.md` | Tech Lead spike result doc (Path A go/no-go, accuracy on 3 clips) — written during Task 3 |

### Files to modify

| File | Change |
|---|---|
| `apps/web/middleware.ts` | Add `/staff/:path*` and `/review` to matcher; `/staff` requires auth, `/review` is public |
| `apps/web/app/(clinic)/dashboard/dashboard-shell.tsx` | Add "Intake Records" nav item linking to `/dashboard/intake` |
| `packages/shared/src/database.types.ts` | Regenerate after migration (or add `intake_records` table type manually) |
| `apps/web/lib/env.ts` | Add `OPENAI_API_KEY`, `INTAKE_WEBHOOK_SECRET`, `VHEALTH_GOOGLE_MAPS_REVIEW_URL` to expected vars |

---

## Database Schema Additions

### Migration `016_intake_records.sql`

```sql
CREATE TABLE public.intake_records (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       text NOT NULL DEFAULT 'vhealth',
  patient_name    text NOT NULL,
  date_of_visit   date NOT NULL,
  therapist_name  text NOT NULL,
  treatment_area  text NOT NULL,
  session_notes   text NOT NULL,
  source          text NOT NULL CHECK (source IN ('telegram', 'in_app', 'manual')),
  raw_transcript  text,          -- Whisper output; null for manual entries
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_intake_records_clinic_date
  ON public.intake_records(clinic_id, date_of_visit DESC);

CREATE TRIGGER set_intake_records_updated_at
  BEFORE UPDATE ON public.intake_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.intake_records ENABLE ROW LEVEL SECURITY;

-- Authenticated clinic users can read all records
CREATE POLICY intake_records_select ON public.intake_records
  FOR SELECT TO authenticated USING (true);

-- Service role (used by API routes) bypasses RLS — no INSERT policy needed for anon
```

---

## Environment Variables

Add these to Vercel project settings and local `.env.local`:

```env
# OpenAI — Whisper transcription
OPENAI_API_KEY=sk-...

# Intake webhook — shared secret between OpenClaw VPS and Vercel API route
INTAKE_WEBHOOK_SECRET=<random 32-char hex>

# Review page — V-Health Google Maps review URL
VHEALTH_GOOGLE_MAPS_REVIEW_URL=https://g.page/r/<place_id>/review

# Already exists — confirm it is set:
ANTHROPIC_API_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

---

## External Service Contracts

### Telegram Bot API

- Bot created via @BotFather on Telegram; token stored in OpenClaw VPS env (not in Vercel).
- Webhook mode: Telegram POSTs updates to `https://<openclaw-vps>/telegram-webhook`.
- OpenClaw VPS Python/Node script receives the update, checks `message.voice` exists, calls `getFile` → downloads `.ogg` audio, then:
  ```
  POST https://physio-os.vercel.app/api/intake/telegram-webhook
  Headers:
    x-webhook-secret: <INTAKE_WEBHOOK_SECRET>
    Content-Type: multipart/form-data
  Body:
    audio: <.ogg binary file>
    chat_id: <telegram chat id — for confirmation reply>
  ```
- Vercel route responds `{ success: true, record_id: "..." }` or `{ error: "..." }`.
- OpenClaw VPS then calls Telegram `sendMessage` to confirm back to the therapist.

### OpenAI Whisper API

- SDK: `openai` npm package (`openai.audio.transcriptions.create`).
- Model: `whisper-1`.
- Input: audio file (Buffer), mime type `audio/ogg` or `audio/webm`.
- Output: `{ text: string }` — raw transcript string.
- Error handling: if `text` is empty or Whisper throws, return `{ error: 'transcription_failed' }` with HTTP 422.

### Claude API (extraction)

- SDK: `@ai-sdk/anthropic` + `generateObject` from `ai` package (already in project).
- Model: `claude-sonnet-4-5` (or current best available in project).
- Input: transcript string.
- Output: typed object matching `IntakeFields` schema (Zod schema used with `generateObject`).
- If extraction confidence is low (any required field is empty string), route returns partial result with a `warnings` array.

### Claude API (review generation)

- Same SDK + `generateText`.
- Input: patient's 2–3 word input + clinic name.
- Output: 3-sentence review draft string.
- Streaming: not required for Phase 1; simple `await generateText(...)`.

---

## Step-by-Step Task Breakdown

---

### Task 1: Database migration + shared types

**Estimated time: 1 hour**

**Files:**
- Create: `supabase/migrations/016_intake_records.sql`
- Create: `packages/shared/src/intake.types.ts`
- Modify: `packages/shared/src/database.types.ts` (add IntakeRecord row type)

- [ ] **Step 1.1: Create the migration file**

Create `supabase/migrations/016_intake_records.sql`:

```sql
-- 016_intake_records.sql — Phase 1 voice intake records

CREATE TABLE public.intake_records (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       text NOT NULL DEFAULT 'vhealth',
  patient_name    text NOT NULL,
  date_of_visit   date NOT NULL,
  therapist_name  text NOT NULL,
  treatment_area  text NOT NULL,
  session_notes   text NOT NULL,
  source          text NOT NULL CHECK (source IN ('telegram', 'in_app', 'manual')),
  raw_transcript  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_intake_records_clinic_date
  ON public.intake_records(clinic_id, date_of_visit DESC);

CREATE TRIGGER set_intake_records_updated_at
  BEFORE UPDATE ON public.intake_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.intake_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY intake_records_select ON public.intake_records
  FOR SELECT TO authenticated USING (true);
```

- [ ] **Step 1.2: Apply the migration**

```bash
cd /Users/lego/@Lego651/physio-os
npx supabase db push --linked
```

Expected: `Applying migration 016_intake_records.sql... done`

If not linked yet: `npx supabase link --project-ref <your-project-ref>` first.

- [ ] **Step 1.3: Create shared intake types**

Create `packages/shared/src/intake.types.ts`:

```typescript
import { z } from 'zod/v4'

/** The 5 structured fields extracted from a voice memo or entered manually */
export const IntakeFieldsSchema = z.object({
  patient_name:   z.string().min(1),
  date_of_visit:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  therapist_name: z.string().min(1),
  treatment_area: z.string().min(1),
  session_notes:  z.string().min(1),
})

export type IntakeFields = z.infer<typeof IntakeFieldsSchema>

/** A persisted intake record (what comes back from the DB) */
export interface IntakeRecord extends IntakeFields {
  id:             string
  clinic_id:      string
  source:         'telegram' | 'in_app' | 'manual'
  raw_transcript: string | null
  created_at:     string
  updated_at:     string
}
```

- [ ] **Step 1.4: Export the new types from the shared package index**

Open `packages/shared/src/index.ts` (or `packages/shared/src/types.ts` — whichever is the current barrel). Add:

```typescript
export * from './intake.types'
```

- [ ] **Step 1.5: Regenerate database types (or add manually)**

```bash
cd /Users/lego/@Lego651/physio-os
pnpm gen:types
```

Expected: `packages/shared/src/database.types.ts` updated with `intake_records` table.

- [ ] **Step 1.6: Typecheck**

```bash
cd /Users/lego/@Lego651/physio-os
pnpm typecheck
```

Expected: 0 errors.

- [ ] **Step 1.7: Commit**

```bash
git add supabase/migrations/016_intake_records.sql packages/shared/src/intake.types.ts packages/shared/src/database.types.ts
git commit -m "feat: add intake_records table and shared IntakeFields types"
```

---

### Task 2: Core library helpers (Whisper + Claude extraction + DB insert)

**Estimated time: 1.5 hours**

**Files:**
- Create: `apps/web/lib/intake/whisper.ts`
- Create: `apps/web/lib/intake/extract.ts`
- Create: `apps/web/lib/intake/db.ts`
- Modify: `apps/web/lib/env.ts`

- [ ] **Step 2.1: Add required env variable guards**

Open `apps/web/lib/env.ts` and add export helpers (the existing pattern uses `requireEnv(name)`; these are just documentation-by-usage, no code change needed unless you want explicit named exports). Verify `.env.local` has all three new vars:

```
OPENAI_API_KEY=sk-...
INTAKE_WEBHOOK_SECRET=<generate with: openssl rand -hex 16>
VHEALTH_GOOGLE_MAPS_REVIEW_URL=https://g.page/r/<place_id>/review
```

- [ ] **Step 2.2: Install @ai-sdk/openai package**

```bash
cd /Users/lego/@Lego651/physio-os/apps/web
pnpm add @ai-sdk/openai
```

Expected: `@ai-sdk/openai` added to `apps/web/package.json` dependencies. (The `@ai-sdk/anthropic` sibling is already present — this follows the same pattern.)

- [ ] **Step 2.3: Create Whisper helper**

Create `apps/web/lib/intake/whisper.ts`:

```typescript
import { experimental_transcribe as transcribe } from 'ai'
import { openai } from '@ai-sdk/openai'

/**
 * Transcribe an audio buffer using OpenAI Whisper via the AI SDK.
 * OPENAI_API_KEY must be set in environment — the @ai-sdk/openai provider
 * picks it up automatically.
 *
 * @param audioBuffer - Raw audio bytes (ogg, webm, mp4, m4a accepted by Whisper)
 * @param filename - Filename with extension, e.g. "voice.ogg" — for logging only
 * @returns Transcript string, or throws on API error
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  filename: string,
): Promise<string> {
  console.log('[whisper] transcription started', { filename, bytes: audioBuffer.length })

  const { text } = await transcribe({
    model: openai.transcription('whisper-1'),
    audio: audioBuffer,
    providerOptions: {
      openai: { language: 'en' },
    },
  })

  console.log('[whisper] transcription complete', { chars: text.length })
  return text
}
```

- [ ] **Step 2.4: Create Claude extraction helper**

Create `apps/web/lib/intake/extract.ts`:

```typescript
import { generateText, Output } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { IntakeFieldsSchema, type IntakeFields } from '@physio-os/shared'
import { requireEnv } from '@/lib/env'

const today = () => new Date().toISOString().slice(0, 10)

/**
 * Extract structured 5-field intake data from a raw voice transcript.
 * Uses Claude via the Vercel AI SDK v6 generateText + Output.object().
 * generateObject was removed in AI SDK v6 — Output.object() is the replacement.
 */
export async function extractIntakeFields(transcript: string): Promise<{
  fields: IntakeFields
  warnings: string[]
}> {
  // Validate key exists before calling
  requireEnv('ANTHROPIC_API_KEY')

  console.log('[extract] starting field extraction', { transcriptChars: transcript.length })

  const { object } = await generateText({
    model: anthropic('claude-sonnet-4-5'),
    output: Output.object({ schema: IntakeFieldsSchema }),
    prompt: `You are a medical scribe assistant for a physiotherapy clinic.

Extract structured intake data from the following therapist voice note transcript.

Rules:
- patient_name: The patient's full name as spoken. If unclear, use "Unknown Patient".
- date_of_visit: Today's date in YYYY-MM-DD format unless a specific date is mentioned. Today is ${today()}.
- therapist_name: The therapist's name if mentioned, otherwise use "David".
- treatment_area: The body area treated (e.g., "lower back", "right shoulder", "knee"). Short phrase.
- session_notes: A clean, complete summary of what was done during the session. Keep clinical detail. Max 500 words.

Transcript:
"""
${transcript}
"""

Return the structured JSON object.`,
  })

  const warnings: string[] = []
  if (object.patient_name === 'Unknown Patient') warnings.push('patient_name could not be extracted')
  if (object.therapist_name === 'David') warnings.push('therapist_name defaulted to David')

  console.log('[extract] extraction complete', { warnings })
  return { fields: object, warnings }
}
```

- [ ] **Step 2.5: Create DB insert helper**

Create `apps/web/lib/intake/db.ts`:

```typescript
import { createAdminClient } from '@/lib/supabase/admin'
import type { IntakeFields, IntakeRecord } from '@physio-os/shared'

export interface SaveIntakeRecordInput extends IntakeFields {
  source: 'telegram' | 'in_app' | 'manual'
  raw_transcript?: string | null
  clinic_id?: string
}

/**
 * Insert a new intake record. Uses service-role client to bypass RLS.
 * Returns the inserted row.
 */
export async function saveIntakeRecord(input: SaveIntakeRecordInput): Promise<IntakeRecord> {
  console.log('[intake/db] saving record', { source: input.source, patient: input.patient_name })
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('intake_records')
    .insert({
      clinic_id:      input.clinic_id ?? 'vhealth',
      patient_name:   input.patient_name,
      date_of_visit:  input.date_of_visit,
      therapist_name: input.therapist_name,
      treatment_area: input.treatment_area,
      session_notes:  input.session_notes,
      source:         input.source,
      raw_transcript: input.raw_transcript ?? null,
    })
    .select()
    .single()

  if (error) {
    console.error('[intake/db] insert failed', { error: error.message })
    throw error
  }

  console.log('[intake/db] record saved', { id: data.id })
  return data as IntakeRecord
}
```

- [ ] **Step 2.6: Typecheck**

```bash
cd /Users/lego/@Lego651/physio-os
pnpm typecheck
```

Expected: 0 errors.

- [ ] **Step 2.7: Commit**

```bash
git add apps/web/lib/intake/
git commit -m "feat: add whisper, extract, and db helpers for intake pipeline"
```

---

### Task 3: Telegram spike — Path A go/no-go (May 13, 2-hour timebox)

**Estimated time: 2 hours (hard timebox — stop and go to Task 5 if not passing)**

**Files:**
- Create: `docs/spike/path-a-outcome.md` (record outcome)

**This task is a time-boxed experiment, not a production build. The output is a pass/fail decision and a written record.**

- [ ] **Step 3.1: Create a Telegram bot for testing**

On your phone:
1. Open Telegram → search for @BotFather
2. Send `/newbot` → name it "VHealth Intake Bot" → username e.g. `vhealth_intake_bot`
3. Copy the bot token (format: `1234567890:ABCDEFabcdef...`)

- [ ] **Step 3.2: Set up OpenClaw VPS webhook script**

On the OpenClaw VPS, create `/home/<user>/vhealth-intake-bot/bot.py` (or `bot.js` depending on available runtime — use what's already on the VPS):

```python
# bot.py — Telegram → physio-os bridge
# Run: pip install python-telegram-bot requests
# Set env: TELEGRAM_BOT_TOKEN, PHYSIO_WEBHOOK_URL, PHYSIO_WEBHOOK_SECRET

import os
import requests
import tempfile
from telegram import Update
from telegram.ext import ApplicationBuilder, MessageHandler, filters, ContextTypes

TELEGRAM_BOT_TOKEN   = os.environ['TELEGRAM_BOT_TOKEN']
PHYSIO_WEBHOOK_URL   = os.environ['PHYSIO_WEBHOOK_URL']   # https://<vercel-url>/api/intake/telegram-webhook
PHYSIO_WEBHOOK_SECRET = os.environ['PHYSIO_WEBHOOK_SECRET']

async def handle_voice(update: Update, context: ContextTypes.DEFAULT_TYPE):
    voice = update.message.voice
    if not voice:
        return

    file = await context.bot.get_file(voice.file_id)
    with tempfile.NamedTemporaryFile(suffix='.ogg', delete=False) as f:
        await file.download_to_drive(f.name)
        audio_path = f.name

    print(f'[bot] received voice memo, file_id={voice.file_id}, size={voice.file_size}')

    with open(audio_path, 'rb') as audio_file:
        resp = requests.post(
            PHYSIO_WEBHOOK_URL,
            headers={'x-webhook-secret': PHYSIO_WEBHOOK_SECRET},
            files={'audio': ('voice.ogg', audio_file, 'audio/ogg')},
            data={'chat_id': str(update.message.chat_id)},
            timeout=60,
        )

    print(f'[bot] physio-os response: {resp.status_code} {resp.text}')

    if resp.ok:
        result = resp.json()
        reply = f"Record saved! Patient: {result['record']['patient_name']} | Area: {result['record']['treatment_area']}"
    else:
        reply = f"Error: {resp.text[:200]}"

    await update.message.reply_text(reply)

if __name__ == '__main__':
    app = ApplicationBuilder().token(TELEGRAM_BOT_TOKEN).build()
    app.add_handler(MessageHandler(filters.VOICE, handle_voice))
    print('[bot] polling...')
    app.run_polling()
```

For the spike, run the bot in **polling mode** (not webhook) — simpler to test without exposing the VPS.

- [ ] **Step 3.3: Deploy Task 2 changes to Vercel preview URL**

```bash
cd /Users/lego/@Lego651/physio-os
# Ensure OPENAI_API_KEY and ANTHROPIC_API_KEY are set in Vercel project settings
vercel deploy --prebuilt 2>/dev/null || vercel deploy
```

Note the preview URL (e.g., `https://physio-os-abc123.vercel.app`). Set `PHYSIO_WEBHOOK_URL=https://physio-os-abc123.vercel.app/api/intake/telegram-webhook` on the VPS.

Note: Task 4 (the actual API route) must be deployed for this to work. If doing the spike before Task 4 is built, implement Task 4 first (it is self-contained and can be deployed separately).

- [ ] **Step 3.4: Record 3 test voice clips**

Use a phone. Record and send each clip to the bot. Each clip should be 20–40 seconds and contain realistic physio terminology:

**Clip 1:**
"Patient is John Smith. Today is [today's date]. I'm David. We worked on lower back stabilization — L4-L5 area. Patient had some lumbar tightness, we did manual therapy and McKenzie exercises, patient reported 70% improvement in pain by end of session."

**Clip 2:**
"Sarah Chen came in today for her right shoulder follow-up. Rotator cuff impingement treatment. We did ultrasound therapy and some active release technique on the supraspinatus. She's progressing well, range of motion improved by about 20 degrees."

**Clip 3:**
"This is a session note for Mike Johnson. Knee rehab post-ACL surgery, week 6. We focused on quad strengthening, single-leg press and terminal knee extension exercises. No pain during session. Ice applied post-session."

- [ ] **Step 3.5: Score each clip**

For each clip, check the returned record JSON. Score accuracy on each of the 5 fields:

| Field | Clip 1 correct? | Clip 2 correct? | Clip 3 correct? |
|---|---|---|---|
| patient_name | | | |
| date_of_visit | | | |
| therapist_name | | | |
| treatment_area | | | |
| session_notes | | | |

A field is "correct" if it contains the right information (not necessarily verbatim — close enough for clinic use).

**Go/No-Go:**
- If 4–5 fields correct on all 3 clips → **GO** (Path A). Continue with Task 4.
- If 2 or more clips score below 4/5 → **NO-GO**. Skip to Task 5 (Path B fallback).

- [ ] **Step 3.6: Write spike outcome doc**

Create `docs/spike/path-a-outcome.md`:

```markdown
# Path A Spike Outcome — May 13

**Date:** 2026-05-13
**Tech Lead:** Jason
**Decision:** [GO / NO-GO]

## Accuracy Results

| Clip | patient_name | date_of_visit | therapist_name | treatment_area | session_notes | Score |
|---|---|---|---|---|---|---|
| 1 | ✓/✗ | ✓/✗ | ✓/✗ | ✓/✗ | ✓/✗ | /5 |
| 2 | ✓/✗ | ✓/✗ | ✓/✗ | ✓/✗ | ✓/✗ | /5 |
| 3 | ✓/✗ | ✓/✗ | ✓/✗ | ✓/✗ | ✓/✗ | /5 |

**Overall:** X/15 fields correct

## Notes

[Any issues encountered with the OpenClaw bridge, latency observations, etc.]

## Path Chosen

[Path A / Path B] — proceeding with Task [4 / 5].
```

- [ ] **Step 3.7: Commit spike doc**

```bash
git add docs/spike/path-a-outcome.md
git commit -m "spike: Path A Telegram accuracy results — [GO/NO-GO]"
```

---

### Task 4: Path A — Telegram webhook API route

**Estimated time: 1.5 hours**

**Build this ONLY if Task 3 results in GO. If NO-GO, skip to Task 5.**

**Files:**
- Create: `apps/web/app/api/intake/telegram-webhook/route.ts`

- [ ] **Step 4.1: Write the test**

Create `apps/web/app/api/intake/telegram-webhook/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the helper modules
vi.mock('@/lib/intake/whisper', () => ({
  transcribeAudio: vi.fn().mockResolvedValue('Patient John Smith, lower back, manual therapy'),
}))
vi.mock('@/lib/intake/extract', () => ({
  extractIntakeFields: vi.fn().mockResolvedValue({
    fields: {
      patient_name:   'John Smith',
      date_of_visit:  '2026-05-13',
      therapist_name: 'David',
      treatment_area: 'lower back',
      session_notes:  'Manual therapy session',
    },
    warnings: [],
  }),
}))
vi.mock('@/lib/intake/db', () => ({
  saveIntakeRecord: vi.fn().mockResolvedValue({ id: 'test-uuid', patient_name: 'John Smith' }),
}))

const VALID_SECRET = 'test-secret-123'
vi.stubEnv('INTAKE_WEBHOOK_SECRET', VALID_SECRET)

describe('POST /api/intake/telegram-webhook', () => {
  it('returns 401 when secret header is missing', async () => {
    const { POST } = await import('../route')
    const formData = new FormData()
    formData.append('chat_id', '12345')
    const req = new Request('http://localhost/api/intake/telegram-webhook', {
      method: 'POST',
      body: formData,
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 400 when audio file is missing', async () => {
    const { POST } = await import('../route')
    const formData = new FormData()
    formData.append('chat_id', '12345')
    const req = new Request('http://localhost/api/intake/telegram-webhook', {
      method: 'POST',
      headers: { 'x-webhook-secret': VALID_SECRET },
      body: formData,
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 200 with record when audio and secret are valid', async () => {
    const { POST } = await import('../route')
    const formData = new FormData()
    const blob = new Blob([new Uint8Array(100)], { type: 'audio/ogg' })
    formData.append('audio', blob, 'voice.ogg')
    formData.append('chat_id', '12345')
    const req = new Request('http://localhost/api/intake/telegram-webhook', {
      method: 'POST',
      headers: { 'x-webhook-secret': VALID_SECRET },
      body: formData,
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.record.patient_name).toBe('John Smith')
  })
})
```

- [ ] **Step 4.2: Run the test to confirm it fails**

```bash
cd /Users/lego/@Lego651/physio-os/apps/web
pnpm test -- --reporter=verbose app/api/intake/telegram-webhook
```

Expected: FAIL — `Cannot find module '../route'`

- [ ] **Step 4.3: Implement the route**

Create `apps/web/app/api/intake/telegram-webhook/route.ts`:

```typescript
import { type NextRequest, NextResponse } from 'next/server'
import { transcribeAudio } from '@/lib/intake/whisper'
import { extractIntakeFields } from '@/lib/intake/extract'
import { saveIntakeRecord } from '@/lib/intake/db'
import { requireEnv } from '@/lib/env'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: NextRequest): Promise<NextResponse> {
  console.log('[api/intake/telegram-webhook] incoming request')

  // 1. Verify shared secret
  const secret = request.headers.get('x-webhook-secret')
  const expectedSecret = requireEnv('INTAKE_WEBHOOK_SECRET')
  if (secret !== expectedSecret) {
    console.warn('[api/intake/telegram-webhook] unauthorized — bad secret')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Parse multipart form data
  let formData: FormData
  try {
    formData = await request.formData()
  } catch (err) {
    console.error('[api/intake/telegram-webhook] formData parse error', { error: String(err) })
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const audioFile = formData.get('audio') as File | null
  if (!audioFile) {
    console.warn('[api/intake/telegram-webhook] no audio file in request')
    return NextResponse.json({ error: 'No audio file provided' }, { status: 400 })
  }

  const chatId = formData.get('chat_id') as string | null

  try {
    // 3. Transcribe with Whisper
    const audioBuffer = Buffer.from(await audioFile.arrayBuffer())
    const transcript = await transcribeAudio(audioBuffer, audioFile.name || 'voice.ogg')

    if (!transcript.trim()) {
      console.warn('[api/intake/telegram-webhook] empty transcript')
      return NextResponse.json({ error: 'Empty transcript — no speech detected' }, { status: 422 })
    }

    // 4. Extract structured fields with Claude
    const { fields, warnings } = await extractIntakeFields(transcript)

    // 5. Persist to DB
    const record = await saveIntakeRecord({
      ...fields,
      source: 'telegram',
      raw_transcript: transcript,
    })

    console.log('[api/intake/telegram-webhook] success', { recordId: record.id, chatId })
    return NextResponse.json({ success: true, record, warnings })
  } catch (err) {
    console.error('[api/intake/telegram-webhook] pipeline error', {
      error: String(err),
      stack: (err as Error).stack,
    })
    return NextResponse.json({ error: 'Pipeline failed', detail: String(err) }, { status: 500 })
  }
}
```

- [ ] **Step 4.4: Run tests to confirm they pass**

```bash
cd /Users/lego/@Lego651/physio-os/apps/web
pnpm test -- --reporter=verbose app/api/intake/telegram-webhook
```

Expected: 3 passing tests.

- [ ] **Step 4.5: Commit**

```bash
git add apps/web/app/api/intake/telegram-webhook/
git commit -m "feat: telegram-webhook API route — Whisper + Claude intake pipeline"
```

---

### Task 5: Path B — In-app upload + save API routes

**Estimated time: 1.5 hours**

**Build this if Task 3 results in NO-GO (Path B is the fallback). If Path A is GO, build this anyway — it is used as the in-app fallback when a therapist is offline from Telegram. Total build time is the same either way.**

**Files:**
- Create: `apps/web/app/api/intake/upload/route.ts`
- Create: `apps/web/app/api/intake/save/route.ts`

- [ ] **Step 5.1: Write failing tests**

Create `apps/web/app/api/intake/upload/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/intake/whisper', () => ({
  transcribeAudio: vi.fn().mockResolvedValue('Patient Jane Doe, neck pain, dry needling'),
}))
vi.mock('@/lib/intake/extract', () => ({
  extractIntakeFields: vi.fn().mockResolvedValue({
    fields: {
      patient_name:   'Jane Doe',
      date_of_visit:  '2026-05-13',
      therapist_name: 'David',
      treatment_area: 'neck',
      session_notes:  'Dry needling session',
    },
    warnings: [],
  }),
}))

describe('POST /api/intake/upload', () => {
  it('returns 400 when no audio file is provided', async () => {
    const { POST } = await import('../route')
    const formData = new FormData()
    const req = new Request('http://localhost/api/intake/upload', {
      method: 'POST',
      body: formData,
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 200 with pre-filled fields when audio is valid', async () => {
    const { POST } = await import('../route')
    const formData = new FormData()
    const blob = new Blob([new Uint8Array(100)], { type: 'audio/webm' })
    formData.append('audio', blob, 'recording.webm')
    const req = new Request('http://localhost/api/intake/upload', {
      method: 'POST',
      body: formData,
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.fields.patient_name).toBe('Jane Doe')
    expect(body.transcript).toBe('Patient Jane Doe, neck pain, dry needling')
  })
})
```

Create `apps/web/app/api/intake/save/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/intake/db', () => ({
  saveIntakeRecord: vi.fn().mockResolvedValue({
    id: 'saved-uuid',
    patient_name: 'Jane Doe',
    date_of_visit: '2026-05-13',
    therapist_name: 'David',
    treatment_area: 'neck',
    session_notes: 'Dry needling session',
    source: 'in_app',
    created_at: '2026-05-13T00:00:00Z',
    updated_at: '2026-05-13T00:00:00Z',
  }),
}))

describe('POST /api/intake/save', () => {
  it('returns 400 when required fields are missing', async () => {
    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/intake/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patient_name: '', date_of_visit: '' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 200 with saved record when all fields are valid', async () => {
    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/intake/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patient_name:   'Jane Doe',
        date_of_visit:  '2026-05-13',
        therapist_name: 'David',
        treatment_area: 'neck',
        session_notes:  'Dry needling session',
        source:         'in_app',
        raw_transcript: 'Patient Jane Doe, neck pain, dry needling',
      }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.record.id).toBe('saved-uuid')
  })
})
```

- [ ] **Step 5.2: Run tests to confirm they fail**

```bash
cd /Users/lego/@Lego651/physio-os/apps/web
pnpm test -- --reporter=verbose app/api/intake/upload app/api/intake/save
```

Expected: FAIL — modules not found.

- [ ] **Step 5.3: Implement upload route**

Create `apps/web/app/api/intake/upload/route.ts`:

```typescript
import { type NextRequest, NextResponse } from 'next/server'
import { transcribeAudio } from '@/lib/intake/whisper'
import { extractIntakeFields } from '@/lib/intake/extract'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: NextRequest): Promise<NextResponse> {
  console.log('[api/intake/upload] incoming request')
  let formData: FormData
  try {
    formData = await request.formData()
  } catch (err) {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const audioFile = formData.get('audio') as File | null
  if (!audioFile) {
    return NextResponse.json({ error: 'No audio file provided' }, { status: 400 })
  }

  try {
    const audioBuffer = Buffer.from(await audioFile.arrayBuffer())
    const transcript = await transcribeAudio(audioBuffer, audioFile.name || 'recording.webm')

    if (!transcript.trim()) {
      return NextResponse.json({ error: 'No speech detected in recording' }, { status: 422 })
    }

    const { fields, warnings } = await extractIntakeFields(transcript)
    console.log('[api/intake/upload] success', { warnings })
    return NextResponse.json({ fields, transcript, warnings })
  } catch (err) {
    console.error('[api/intake/upload] error', { error: String(err), stack: (err as Error).stack })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
```

- [ ] **Step 5.4: Implement save route**

Create `apps/web/app/api/intake/save/route.ts`:

```typescript
import { type NextRequest, NextResponse } from 'next/server'
import { saveIntakeRecord } from '@/lib/intake/db'
import { IntakeFieldsSchema } from '@physio-os/shared'

export const runtime = 'nodejs'

export async function POST(request: NextRequest): Promise<NextResponse> {
  console.log('[api/intake/save] incoming request')
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = IntakeFieldsSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 })
  }

  const { source, raw_transcript } = body as { source?: string; raw_transcript?: string }

  try {
    const record = await saveIntakeRecord({
      ...parsed.data,
      source: (source === 'telegram' || source === 'in_app' ? source : 'manual') as 'telegram' | 'in_app' | 'manual',
      raw_transcript: raw_transcript ?? null,
    })
    console.log('[api/intake/save] saved', { id: record.id })
    return NextResponse.json({ record })
  } catch (err) {
    console.error('[api/intake/save] error', { error: String(err) })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
```

- [ ] **Step 5.5: Run tests to confirm they pass**

```bash
cd /Users/lego/@Lego651/physio-os/apps/web
pnpm test -- --reporter=verbose app/api/intake/upload app/api/intake/save
```

Expected: 4 tests passing.

- [ ] **Step 5.6: Commit**

```bash
git add apps/web/app/api/intake/
git commit -m "feat: upload and save API routes for in-app Path B intake pipeline"
```

---

### Task 6: Staff intake form — Path B UI

**Estimated time: 2 hours**

**Files:**
- Create: `apps/web/app/staff/intake/page.tsx`
- Create: `apps/web/app/staff/intake/intake-form.tsx`
- Modify: `apps/web/middleware.ts`

- [ ] **Step 6.1: Add `/staff/:path*` to middleware**

Open `apps/web/middleware.ts`. The current matcher is:

```typescript
matcher: ['/chat/:path*', '/onboarding/:path*', '/dashboard/:path*', '/api/chat/:path*', '/api/admin/:path*'],
```

Change to:

```typescript
matcher: [
  '/chat/:path*',
  '/onboarding/:path*',
  '/dashboard/:path*',
  '/staff/:path*',
  '/api/chat/:path*',
  '/api/admin/:path*',
],
```

The existing `updateSession` middleware already handles auth redirects for protected routes — the `/staff` prefix is now protected by the same session check.

- [ ] **Step 6.2: Create the page (server component — auth check)**

Create `apps/web/app/staff/intake/page.tsx`:

```typescript
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { IntakeForm } from './intake-form'

export const dynamic = 'force-dynamic'

export default async function StaffIntakePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/dashboard/login?next=/staff/intake')
  }

  return (
    <main className="min-h-dvh bg-background px-4 py-8">
      <div className="mx-auto max-w-lg">
        <h1 className="mb-6 text-2xl font-semibold">New Session Record</h1>
        <IntakeForm />
      </div>
    </main>
  )
}
```

- [ ] **Step 6.3: Create the intake form client component**

Create `apps/web/app/staff/intake/intake-form.tsx`:

```typescript
'use client'

import { useState, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { IntakeFields } from '@physio-os/shared'

const today = () => new Date().toISOString().slice(0, 10)

export function IntakeForm() {
  const [fields, setFields] = useState<IntakeFields>({
    patient_name:   '',
    date_of_visit:  today(),
    therapist_name: '',
    treatment_area: '',
    session_notes:  '',
  })
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [rawTranscript, setRawTranscript] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const startRecording = useCallback(async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm'
      const mr = new MediaRecorder(stream, { mimeType })
      chunksRef.current = []
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunksRef.current, { type: mimeType })
        await processAudio(blob)
      }
      mediaRecorderRef.current = mr
      mr.start()
      setRecording(true)
    } catch (err) {
      setError('Microphone access denied. Please allow microphone access and try again.')
    }
  }, [])

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop()
    setRecording(false)
    setTranscribing(true)
  }, [])

  async function processAudio(blob: Blob) {
    const formData = new FormData()
    formData.append('audio', blob, 'recording.webm')
    try {
      const res = await fetch('/api/intake/upload', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Upload failed')
      setFields((prev) => ({ ...prev, ...data.fields }))
      setRawTranscript(data.transcript)
      setWarnings(data.warnings ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transcription failed')
    } finally {
      setTranscribing(false)
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      const res = await fetch('/api/intake/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...fields,
          source: rawTranscript ? 'in_app' : 'manual',
          raw_transcript: rawTranscript,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Save failed')
      setSaved(true)
      // Reset after 2s so therapist can log another
      setTimeout(() => {
        setSaved(false)
        setFields({ patient_name: '', date_of_visit: today(), therapist_name: '', treatment_area: '', session_notes: '' })
        setRawTranscript(null)
        setWarnings([])
      }, 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (saved) {
    return (
      <Card>
        <CardContent className="pt-8 text-center">
          <p className="text-2xl font-semibold text-green-600">Saved!</p>
          <p className="mt-2 text-sm text-muted-foreground">Record added to dashboard.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Session Details</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="flex flex-col gap-5">
          {/* Voice recording button */}
          <div className="flex flex-col gap-2">
            <Label>Voice Note (optional — auto-fills fields below)</Label>
            {transcribing ? (
              <p className="text-sm text-muted-foreground">Transcribing...</p>
            ) : recording ? (
              <Button type="button" variant="destructive" size="lg" className="h-14 text-base" onClick={stopRecording}>
                Stop Recording
              </Button>
            ) : (
              <Button type="button" variant="outline" size="lg" className="h-14 text-base" onClick={startRecording}>
                Tap to Record
              </Button>
            )}
            {warnings.length > 0 && (
              <p className="text-xs text-amber-600">
                Low confidence on: {warnings.join(', ')} — please review fields below.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="patient_name">Patient Name *</Label>
            <Input
              id="patient_name"
              required
              value={fields.patient_name}
              onChange={(e) => setFields((p) => ({ ...p, patient_name: e.target.value }))}
              placeholder="John Smith"
              className="h-12"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="date_of_visit">Date of Visit *</Label>
            <Input
              id="date_of_visit"
              type="date"
              required
              value={fields.date_of_visit}
              onChange={(e) => setFields((p) => ({ ...p, date_of_visit: e.target.value }))}
              className="h-12"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="therapist_name">Therapist *</Label>
            <Input
              id="therapist_name"
              required
              value={fields.therapist_name}
              onChange={(e) => setFields((p) => ({ ...p, therapist_name: e.target.value }))}
              placeholder="David"
              className="h-12"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="treatment_area">Treatment Area *</Label>
            <Input
              id="treatment_area"
              required
              value={fields.treatment_area}
              onChange={(e) => setFields((p) => ({ ...p, treatment_area: e.target.value }))}
              placeholder="lower back"
              className="h-12"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="session_notes">Session Notes *</Label>
            <Textarea
              id="session_notes"
              required
              value={fields.session_notes}
              onChange={(e) => setFields((p) => ({ ...p, session_notes: e.target.value }))}
              placeholder="What was done during this session..."
              rows={5}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" disabled={saving} size="lg" className="h-14 text-base">
            {saving ? 'Saving...' : 'Save Record'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 6.4: Build check**

```bash
cd /Users/lego/@Lego651/physio-os
pnpm build 2>&1 | tail -20
```

Expected: Build completes without errors.

- [ ] **Step 6.5: Manual test on mobile**

1. Deploy to Vercel preview: `vercel deploy`
2. Open the preview URL on your iPhone at `/staff/intake`
3. Login with dashboard credentials
4. Tap "Tap to Record", speak a 20-second session note, tap "Stop Recording"
5. Verify fields auto-fill within 10 seconds
6. Tap "Save Record"
7. Open the Supabase dashboard, confirm a new row exists in `intake_records`

- [ ] **Step 6.6: Commit**

```bash
git add apps/web/app/staff/intake/ apps/web/middleware.ts
git commit -m "feat: in-app staff intake form with MediaRecorder voice capture (Path B)"
```

---

### Task 7: Therapist dashboard — Intake list + detail pages

**Estimated time: 2 hours**

**Files:**
- Create: `apps/web/app/(clinic)/dashboard/intake/page.tsx`
- Create: `apps/web/app/(clinic)/dashboard/intake/[id]/page.tsx`
- Create: `apps/web/app/(clinic)/dashboard/intake/intake-list.tsx`
- Create: `apps/web/app/(clinic)/dashboard/intake/intake-detail.tsx`
- Modify: `apps/web/app/(clinic)/dashboard/dashboard-shell.tsx`

- [ ] **Step 7.1: Add intake nav item to dashboard shell**

Open `apps/web/app/(clinic)/dashboard/dashboard-shell.tsx`.

Change the `navItems` array from:

```typescript
const navItems = [
  { title: 'Patients', href: '/dashboard/patients', icon: Users },
  { title: 'Settings', href: '/dashboard/settings', icon: Settings },
]
```

To:

```typescript
import { Users, Settings, LogOut, ClipboardList } from 'lucide-react'

const navItems = [
  { title: 'Patients', href: '/dashboard/patients', icon: Users },
  { title: 'Intake Records', href: '/dashboard/intake', icon: ClipboardList },
  { title: 'Settings', href: '/dashboard/settings', icon: Settings },
]
```

- [ ] **Step 7.2: Create the list page (server component)**

Create `apps/web/app/(clinic)/dashboard/intake/page.tsx`:

```typescript
import { createAdminClient } from '@/lib/supabase/admin'
import type { IntakeRecord } from '@physio-os/shared'
import { IntakeList } from './intake-list'

export const dynamic = 'force-dynamic'

async function getIntakeRecords(): Promise<IntakeRecord[]> {
  console.log('[dashboard/intake] fetching records')
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('intake_records')
    .select('*')
    .eq('clinic_id', 'vhealth')
    .order('date_of_visit', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[dashboard/intake] fetch error', { error: error.message })
    throw error
  }
  return (data ?? []) as IntakeRecord[]
}

export default async function IntakePage() {
  const records = await getIntakeRecords()
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Intake Records</h1>
        <a
          href="/staff/intake"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          + New Record
        </a>
      </div>
      <IntakeList records={records} />
    </div>
  )
}
```

- [ ] **Step 7.3: Create the intake list client component**

Create `apps/web/app/(clinic)/dashboard/intake/intake-list.tsx`:

```typescript
'use client'

import Link from 'next/link'
import type { IntakeRecord } from '@physio-os/shared'
import { Card, CardContent } from '@/components/ui/card'

interface IntakeListProps {
  records: IntakeRecord[]
}

export function IntakeList({ records }: IntakeListProps) {
  if (records.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          No intake records yet. Use the "+ New Record" button or send a voice memo via Telegram.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/50">
          <tr>
            <th className="px-4 py-3 text-left font-medium">Date</th>
            <th className="px-4 py-3 text-left font-medium">Patient</th>
            <th className="px-4 py-3 text-left font-medium">Therapist</th>
            <th className="px-4 py-3 text-left font-medium">Treatment Area</th>
            <th className="px-4 py-3 text-left font-medium">Notes Preview</th>
            <th className="px-4 py-3 text-right font-medium">Action</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record, i) => (
            <tr key={record.id} className={i % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
              <td className="whitespace-nowrap px-4 py-3">{record.date_of_visit}</td>
              <td className="px-4 py-3 font-medium">{record.patient_name}</td>
              <td className="px-4 py-3">{record.therapist_name}</td>
              <td className="px-4 py-3">{record.treatment_area}</td>
              <td className="max-w-xs truncate px-4 py-3 text-muted-foreground">
                {record.session_notes.slice(0, 80)}{record.session_notes.length > 80 ? '…' : ''}
              </td>
              <td className="px-4 py-3 text-right">
                <Link
                  href={`/dashboard/intake/${record.id}`}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  View / PDF
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 7.4: Create the detail page (server component)**

Create `apps/web/app/(clinic)/dashboard/intake/[id]/page.tsx`:

```typescript
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import type { IntakeRecord } from '@physio-os/shared'
import { IntakeDetail } from '../intake-detail'

export const dynamic = 'force-dynamic'

async function getRecord(id: string): Promise<IntakeRecord | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('intake_records')
    .select('*')
    .eq('id', id)
    .single()

  if (error) return null
  return data as IntakeRecord
}

export default async function IntakeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const record = await getRecord(id)
  if (!record) notFound()
  return <IntakeDetail record={record} />
}
```

- [ ] **Step 7.5: Create the detail client component**

Create `apps/web/app/(clinic)/dashboard/intake/intake-detail.tsx`:

```typescript
'use client'

import Link from 'next/link'
import type { IntakeRecord } from '@physio-os/shared'
import { Button } from '@/components/ui/button'

interface IntakeDetailProps {
  record: IntakeRecord
}

export function IntakeDetail({ record }: IntakeDetailProps) {
  return (
    <>
      {/* Print-only header — hidden on screen */}
      <div className="mb-6 hidden print:block">
        <h1 className="text-2xl font-bold">V-Health Rehab Clinic</h1>
        <p className="text-sm text-gray-500">Patient Session Record</p>
        <hr className="mt-2" />
      </div>

      <div className="space-y-6">
        {/* Screen-only nav */}
        <div className="flex items-center gap-4 print:hidden">
          <Link href="/dashboard/intake" className="text-sm text-muted-foreground hover:underline">
            ← Back to Records
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
          >
            Print / Download PDF
          </Button>
        </div>

        {/* Record card */}
        <div className="rounded-lg border bg-card p-6 shadow-sm print:border-none print:p-0 print:shadow-none">
          <h2 className="mb-6 text-xl font-semibold print:text-lg">
            Session Record — {record.patient_name}
          </h2>

          <dl className="grid grid-cols-2 gap-x-8 gap-y-4 print:gap-y-3">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground print:text-gray-500">
                Date of Visit
              </dt>
              <dd className="mt-1 text-base print:text-sm">{record.date_of_visit}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground print:text-gray-500">
                Therapist
              </dt>
              <dd className="mt-1 text-base print:text-sm">{record.therapist_name}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground print:text-gray-500">
                Treatment Area
              </dt>
              <dd className="mt-1 text-base print:text-sm">{record.treatment_area}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground print:text-gray-500">
                Source
              </dt>
              <dd className="mt-1 text-base capitalize print:text-sm">{record.source.replace('_', ' ')}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground print:text-gray-500">
                Session Notes
              </dt>
              <dd className="mt-1 whitespace-pre-wrap text-base leading-relaxed print:text-sm">
                {record.session_notes}
              </dd>
            </div>
            {record.raw_transcript && (
              <div className="col-span-2 print:hidden">
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Raw Transcript (voice note)
                </dt>
                <dd className="mt-1 whitespace-pre-wrap rounded bg-muted p-3 text-xs text-muted-foreground">
                  {record.raw_transcript}
                </dd>
              </div>
            )}
          </dl>

          {/* Print-only footer */}
          <div className="mt-8 hidden border-t pt-4 print:block">
            <p className="text-xs text-gray-400">
              Generated by physio-os · {new Date().toLocaleDateString()} · Record ID: {record.id}
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 7.6: Build check**

```bash
cd /Users/lego/@Lego651/physio-os
pnpm build 2>&1 | tail -20
```

Expected: 0 errors.

- [ ] **Step 7.7: Commit**

```bash
git add apps/web/app/(clinic)/dashboard/intake/ apps/web/app/(clinic)/dashboard/dashboard-shell.tsx
git commit -m "feat: intake records dashboard list + detail views with PDF print"
```

---

### Task 8: PDF export — print stylesheet

**Estimated time: 30 minutes**

The `window.print()` approach used in Task 7 is sufficient for Phase 1. The print stylesheet ensures sidebar, nav, and header are hidden when printing, and the record renders cleanly on a single page.

**Files:**
- Modify: `apps/web/app/globals.css` (add `@media print` block)

- [ ] **Step 8.1: Add print styles to globals.css**

Open `apps/web/app/globals.css`. At the end of the file, add:

```css
/* ============================================================
   Print styles — intake record PDF export
   ============================================================ */
@media print {
  /* Hide all chrome */
  [data-sidebar],
  [data-sidebar-provider],
  header,
  nav,
  .print\:hidden {
    display: none !important;
  }

  /* Remove padding/margin from page shell */
  body {
    background: white !important;
  }

  main {
    padding: 0 !important;
    overflow: visible !important;
  }

  /* Ensure record card uses full page width */
  .print\:border-none {
    border: none !important;
    box-shadow: none !important;
  }

  /* Enforce readable font size */
  .print\:text-sm {
    font-size: 0.875rem !important;
  }

  /* Show print-only elements */
  .print\:block {
    display: block !important;
  }
}
```

- [ ] **Step 8.2: Test PDF output manually**

1. Open the detail page for any intake record in Chrome on desktop
2. Open the browser print dialog (Cmd+P on macOS)
3. Verify: sidebar is hidden, header is hidden, record content fills the page, footer shows clinic name + record ID
4. Save as PDF — verify readable output

- [ ] **Step 8.3: Test on iPhone**

On David's iPhone (or your test device):
1. Open the detail page in Safari
2. Tap the Share icon → "Print"
3. Verify the output is clean — no sidebar, no header

- [ ] **Step 8.4: Commit**

```bash
git add apps/web/app/globals.css
git commit -m "feat: print stylesheet for intake record PDF export"
```

---

### Task 9: AI Review Assistant — public `/review` page

**Estimated time: 2 hours**

**Files:**
- Create: `apps/web/app/api/review/generate/route.ts`
- Create: `apps/web/app/review/page.tsx`
- Create: `apps/web/app/review/review-assistant.tsx`

- [ ] **Step 9.1: Write failing test for the generate API route**

Create `apps/web/app/api/review/generate/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>()
  return {
    ...actual,
    generateText: vi.fn().mockResolvedValue({
      text: 'Great experience at V-Health! The team was professional and caring. I highly recommend this clinic to anyone seeking physiotherapy in Calgary.',
    }),
  }
})
vi.mock('@ai-sdk/anthropic', () => ({
  anthropic: vi.fn().mockReturnValue('mock-model'),
}))
vi.stubEnv('ANTHROPIC_API_KEY', 'test-key')
vi.stubEnv('VHEALTH_GOOGLE_MAPS_REVIEW_URL', 'https://g.page/r/test/review')

describe('POST /api/review/generate', () => {
  it('returns 400 when no body is provided', async () => {
    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/review/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns a 3-sentence review draft when input is provided', async () => {
    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/review/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: 'great shoulder treatment' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(typeof body.draft).toBe('string')
    expect(body.draft.length).toBeGreaterThan(20)
    expect(body.reviewUrl).toBe('https://g.page/r/test/review')
  })

  it('returns a draft even when input is empty string', async () => {
    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/review/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: '' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(typeof body.draft).toBe('string')
  })
})
```

- [ ] **Step 9.2: Run the test to confirm it fails**

```bash
cd /Users/lego/@Lego651/physio-os/apps/web
pnpm test -- --reporter=verbose app/api/review/generate
```

Expected: FAIL — module not found.

- [ ] **Step 9.3: Implement the generate route**

Create `apps/web/app/api/review/generate/route.ts`:

```typescript
import { type NextRequest, NextResponse } from 'next/server'
import { generateText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { requireEnv } from '@/lib/env'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(request: NextRequest): Promise<NextResponse> {
  console.log('[api/review/generate] incoming request')
  let body: { input?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (body.input === undefined || body.input === null) {
    return NextResponse.json({ error: 'input field is required (can be empty string)' }, { status: 400 })
  }

  requireEnv('ANTHROPIC_API_KEY')
  const reviewUrl = requireEnv('VHEALTH_GOOGLE_MAPS_REVIEW_URL')

  const patientInput = body.input.trim()
  const prompt = patientInput.length > 0
    ? `A patient at V-Health Rehab Clinic in Calgary says: "${patientInput}".`
    : `A patient recently visited V-Health Rehab Clinic in Calgary.`

  try {
    const { text } = await generateText({
      model: anthropic('claude-haiku-4-5'),
      prompt: `${prompt}

Write a friendly, authentic 3-sentence Google review on their behalf. The review should:
- Sound like a real patient, not a marketing message
- Mention the clinic by name (V-Health Rehab Clinic)
- Be warm and specific enough to be credible
- End with a recommendation

Output only the review text — no quotes, no introduction, no explanation.`,
    })

    console.log('[api/review/generate] success', { draftChars: text.length })
    return NextResponse.json({ draft: text.trim(), reviewUrl })
  } catch (err) {
    console.error('[api/review/generate] error', { error: String(err) })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
```

- [ ] **Step 9.4: Run the test to confirm it passes**

```bash
cd /Users/lego/@Lego651/physio-os/apps/web
pnpm test -- --reporter=verbose app/api/review/generate
```

Expected: 3 passing tests.

- [ ] **Step 9.5: Create the review page (server component — no auth)**

Create `apps/web/app/review/page.tsx`:

```typescript
import { ReviewAssistant } from './review-assistant'

export const metadata = {
  title: 'Leave a Review — V-Health',
}

export default function ReviewPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold">Leave a Review</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tell us about your visit in a word or two
          </p>
        </div>
        <ReviewAssistant />
      </div>
    </main>
  )
}
```

- [ ] **Step 9.6: Create the review assistant client component**

Create `apps/web/app/review/review-assistant.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'

type Stage = 'input' | 'loading' | 'draft'

export function ReviewAssistant() {
  const [input, setInput] = useState('')
  const [draft, setDraft] = useState('')
  const [reviewUrl, setReviewUrl] = useState('')
  const [stage, setStage] = useState<Stage>('input')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleGenerate() {
    setError(null)
    setStage('loading')
    try {
      const res = await fetch('/api/review/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Generation failed')
      setDraft(data.draft)
      setReviewUrl(data.reviewUrl)
      setStage('draft')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setStage('input')
    }
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(draft)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (stage === 'loading') {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-sm text-muted-foreground">Writing your review...</p>
        </CardContent>
      </Card>
    )
  }

  if (stage === 'draft') {
    return (
      <Card>
        <CardContent className="pt-6 flex flex-col gap-4">
          <div className="rounded-md bg-muted p-4">
            <p className="text-sm leading-relaxed">{draft}</p>
          </div>
          <Button size="lg" className="h-14 w-full text-base" onClick={handleCopy}>
            {copied ? 'Copied!' : 'Copy Review'}
          </Button>
          {reviewUrl && (
            <a
              href={reviewUrl}
              target="_blank"
              rel="noreferrer"
              className="block text-center text-sm text-primary underline-offset-4 hover:underline"
            >
              Open Google Maps to paste your review
            </a>
          )}
          <button
            className="text-xs text-muted-foreground underline-offset-4 hover:underline"
            onClick={() => { setStage('input'); setInput('') }}
          >
            Start over
          </button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="pt-6 flex flex-col gap-4">
        <Textarea
          placeholder="Tell us anything (a word, a sentence — up to you)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={3}
          className="resize-none text-base"
          autoFocus
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button
          size="lg"
          className="h-14 w-full text-base"
          onClick={handleGenerate}
        >
          Write My Review
        </Button>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 9.7: Build check**

```bash
cd /Users/lego/@Lego651/physio-os/apps/web
pnpm build 2>&1 | tail -20
```

Expected: 0 errors.

- [ ] **Step 9.8: Acceptance criteria check (manual test on iPhone)**

Deploy to preview: `vercel deploy`

On your iPhone, open `https://<preview-url>/review`:
- [ ] Page loads in under 2 seconds (AC B1)
- [ ] Only one text field is visible on load — no other form fields or navigation (AC B2)
- [ ] Type nothing, tap "Write My Review" — a 3-sentence draft appears (AC B3 — empty input)
- [ ] Type "shoulder much better", tap "Write My Review" — draft appears with copy button and Google Maps link (AC B3, B4)
- [ ] Tap "Copy Review" — text is copied to clipboard (verify by pasting in Notes app) (AC B4)
- [ ] Time from QR-open to draft-copied: confirm under 45 seconds (AC B5)
- [ ] Page URL is shareable, no login prompt appeared (AC B7)

- [ ] **Step 9.9: Generate QR code for the page**

Use any QR generator (e.g., `https://qr-code-generator.com` or `npx qrcode-terminal`):

```bash
npx qrcode-terminal "https://physio-os.vercel.app/review"
```

The target URL is the **production Vercel URL**, not a preview URL. Confirm the production URL once the final deploy is done in Task 10.

- [ ] **Step 9.10: Commit**

```bash
git add apps/web/app/api/review/ apps/web/app/review/
git commit -m "feat: AI Review Assistant public page at /review with Claude draft generation"
```

---

### Task 10: Demo seed data + final deploy + end-to-end run-through

**Estimated time: 1.5 hours**

**Files:**
- Create: `supabase/seed-intake-demo.sql`

- [ ] **Step 10.1: Create demo seed data**

Create `supabase/seed-intake-demo.sql`:

```sql
-- Demo seed — 5 realistic V-Health intake records for May 20 demo
-- Run: npx supabase db push --linked  OR paste into Supabase SQL editor

INSERT INTO public.intake_records (
  clinic_id, patient_name, date_of_visit, therapist_name, treatment_area, session_notes, source
) VALUES
(
  'vhealth',
  'Wei Chen',
  '2026-05-12',
  'David',
  'lower back',
  'Patient Wei Chen presented with chronic lumbar pain at L4-L5 level. Session focused on myofascial release and McKenzie extension exercises. Patient reported 60% reduction in pain by end of session. Home exercise program reviewed — patient compliant with previous routine. Follow-up booked for May 19.',
  'manual'
),
(
  'vhealth',
  'Sarah Mitchell',
  '2026-05-11',
  'David',
  'right shoulder',
  'Rotator cuff impingement — supraspinatus involvement. Ultrasound therapy applied at 1MHz for 8 minutes. Active release technique on posterior capsule. Range of motion improved from 140° to 160° external rotation by end of session. Patient managing well. Advised to continue theraband strengthening daily.',
  'telegram'
),
(
  'vhealth',
  'James Park',
  '2026-05-10',
  'David',
  'right knee — post-ACL',
  'Week 8 post ACL reconstruction. Quad strengthening focus: leg press 60% BW, terminal knee extension 3x15. No pain during loading. Single-leg balance improved — 28s on right vs 35s on left. Gait pattern normalizing. Cleared for light jogging next session pending pain response.',
  'in_app'
),
(
  'vhealth',
  'Linda Zhao',
  '2026-05-09',
  'David',
  'cervical spine — neck',
  'Cervicogenic headache management. C2-C3 joint mobilization grade III. Deep neck flexor activation exercises. Patient reported headache frequency reduced from 5x/week to 2x/week since last visit — good progress. Posture correction cues reinforced for desk work. Next session in 2 weeks.',
  'manual'
),
(
  'vhealth',
  'Michael Torres',
  '2026-05-08',
  'David',
  'plantar fasciitis — left foot',
  'Left heel pain — plantar fasciitis, 3-month history. Soft tissue mobilization to plantar fascia and intrinsic foot muscles. Dry needling applied to gastrocnemius trigger points. First visit — patient was 7/10 pain on arrival, 4/10 at discharge. Custom taping applied. Stretching program prescribed. Follow-up weekly for 4 weeks.',
  'telegram'
);
```

- [ ] **Step 10.2: Run seed against the linked Supabase project**

```bash
npx supabase db push --linked
# Then run the seed:
psql "$(npx supabase status --output json | jq -r '.DB_URL')" -f supabase/seed-intake-demo.sql
```

Or paste the SQL directly into the Supabase SQL editor in the dashboard.

Verify: open `/dashboard/intake` in the browser — 5 records should appear.

- [ ] **Step 10.3: Add all new env vars to Vercel production project**

```bash
vercel env add OPENAI_API_KEY production
vercel env add INTAKE_WEBHOOK_SECRET production
vercel env add VHEALTH_GOOGLE_MAPS_REVIEW_URL production
```

Verify existing vars are set: `vercel env ls`

- [ ] **Step 10.4: Deploy to production**

```bash
cd /Users/lego/@Lego651/physio-os
git push origin main
# Or trigger via Vercel dashboard if connected to GitHub
```

Wait for build to complete: `vercel logs --follow`

- [ ] **Step 10.5: End-to-end run-through (May 19 — Jason plays David)**

Work through each of the 4 demo segments from the ELT-locked demo script:

**Segment 1 — Voice intake (4 min)**
- [ ] Open `/staff/intake` on iPhone
- [ ] Tap "Tap to Record", speak a 20-second session note, tap "Stop Recording"
- [ ] Fields auto-fill within 15 seconds
- [ ] Tap "Save Record" — green confirmation appears
- [ ] Open `/dashboard/intake` — new record appears at top of list

**Segment 2 — Dashboard with seed entries (3 min)**
- [ ] Open `/dashboard/intake` on a laptop browser
- [ ] Confirm 5+ records are visible with correct columns
- [ ] Confirm newest entry (from Segment 1) is at the top

**Segment 3 — PDF export (2 min)**
- [ ] Click "View / PDF" on any seeded record
- [ ] Click "Print / Download PDF"
- [ ] Print dialog opens — preview shows clinic name, all 5 fields, no sidebar/nav
- [ ] Save as PDF — confirm file is clean

**Segment 4 — Review assistant (2 min)**
- [ ] Open `https://physio-os.vercel.app/review` on iPhone
- [ ] Type "shoulder much better" → tap "Write My Review"
- [ ] Draft appears in under 5 seconds
- [ ] Tap "Copy Review" — confirm "Copied!" appears
- [ ] Tap "Open Google Maps..." — Google Maps review page opens

- [ ] **Step 10.6: Log any blockers**

For any demo segment that fails or feels rough, create a brief note in `docs/spike/path-a-outcome.md` or a new `docs/spike/demo-run-through-may19.md` so issues are tracked before the real demo.

- [ ] **Step 10.7: Commit and tag**

```bash
git add supabase/seed-intake-demo.sql
git commit -m "demo: seed 5 intake records for May 20 David demo"
git tag v0.1.0-phase1-demo
git push origin main --tags
```

---

## Test Plan

### Automated tests (vitest)

| Test file | What it covers |
|---|---|
| `app/api/intake/telegram-webhook/__tests__/route.test.ts` | Secret validation, missing audio 400, happy path 200 |
| `app/api/intake/upload/__tests__/route.test.ts` | Missing audio 400, valid audio returns pre-filled fields |
| `app/api/intake/save/__tests__/route.test.ts` | Validation errors 400, valid fields return saved record |
| `app/api/review/generate/__tests__/route.test.ts` | Missing input 400, empty string returns draft, non-empty input returns draft |

Run all: `cd apps/web && pnpm test`

### Manual acceptance criteria

| AC | Description | How to test |
|---|---|---|
| Voice → DB in 60s | Telegram voice memo creates a DB row within 60 seconds | Task 3 spike + Task 10 run-through |
| Dashboard on iPhone | David logs in and sees all records | Task 10 Segment 2 |
| PDF in 1 click | Any record → click → print dialog → save as PDF | Task 10 Segment 3 |
| Review page < 2s load | `/review` loads on first visit < 2s | Chrome DevTools Throttle → Fast 3G |
| Review draft < 5s | 2-word input → draft appears < 5s | Task 9 Step 9.8 + Task 10 Segment 4 |
| Review page no auth | Open `/review` in incognito — no login prompt | Verify in Task 9 |
| QR printable at 300 DPI | QR code scanned from printed card opens correct URL | Print + scan in Task 9.9 |

---

## Open Questions (technical only — strategy is locked)

1. **OpenClaw VPS Python runtime.** The bot script in Task 3 assumes Python + `python-telegram-bot`. If the VPS only has Node, use `node-telegram-bot-api` instead — the architecture is identical, just different syntax. Confirm the VPS runtime before starting Task 3.

2. **Whisper audio codec.** Telegram sends `.oga` (OGG Vorbis) files, not `.ogg`. The `openai.audio.transcriptions.create` call accepts both, but the `toFile` call in `whisper.ts` uses the file extension to set the MIME type. If Whisper rejects `.oga`, change the file extension to `.ogg` when forwarding from the VPS — Whisper doesn't validate codec, only container.

3. **`@supabase/ssr` version 0.10.** The existing project uses `@supabase/ssr@0.10.0`. The `intake_records` table uses the existing `createAdminClient()` (service role, bypasses RLS) pattern already used in the patients dashboard — no new Supabase client patterns are introduced. No upgrade needed.

4. **`VHEALTH_GOOGLE_MAPS_REVIEW_URL`.** This requires the V-Health Google Maps listing Place ID. Jason must confirm the Google Maps URL with David. If the URL is not available by May 13, the review page can hard-code a placeholder and the env var is updated before the May 20 demo.

5. **Supabase `zod/v4` import.** The `IntakeFieldsSchema` in `intake.types.ts` uses `import { z } from 'zod/v4'`. The project has `zod@^4.3.6` in `apps/web/package.json`. Confirm `packages/shared` also has `zod` in its own `package.json` dependencies — if not, add it before Task 1 typecheck passes.

6. **`packages/shared/src/index.ts` vs `types.ts`.** Task 1 Step 1.4 says to add the export to the barrel file. Confirm which file is the actual barrel by checking `packages/shared/package.json` `main`/`exports` fields before editing.

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Path A spike fails (Whisper accuracy <80% on physio jargon in OGG from Telegram) | Medium | Medium | Path B (MediaRecorder) is fully spec'd and buildable in the same window. 2-hour timebox on Task 3 prevents it from eating the build week. |
| OpenClaw VPS bot setup takes > 2 hours | Medium | Low | Path B exists. If VPS setup is taking more than 2 hours, stop, document, move to Path B immediately. The spike timebox is the safety valve. |
| Supabase migration conflict (existing migration 015 unknown) | Low | Low | Check `supabase/migrations/` numbering before running migration. Rename `016_` to `016_` or next sequential number as needed. |
| `generateObject` Zod v4 incompatibility with Vercel AI SDK | Low | Medium | Vercel AI SDK `ai@^6` supports Zod v4 natively. If there is an error, fall back to `generateText` + `JSON.parse` with manual validation — extraction prompt already specifies JSON output. |
| `window.print()` PDF quality on iOS Safari insufficient for demo | Low | Low | iOS Safari's "Print" → "Share as PDF" produces clean output. Test in Task 8 Step 8.3 before demo day. If it's unacceptable, swap to `@react-pdf/renderer` — a 1–2 hour addition. |
| VHEALTH_GOOGLE_MAPS_REVIEW_URL not available by May 13 | Medium | Low | Hard-code a placeholder URL for the review page in dev. Swap the real URL in Vercel env before May 20 — no code change required. |
| David account not set up in Supabase Auth | Low | High | Create David's account in Supabase Auth dashboard (email + password) before May 19 run-through. Route already protected by existing auth middleware — no new code needed. |
| Claude haiku slow on review generation >5 seconds | Low | Medium | `claude-haiku-4-5` is the fastest Anthropic model. If >5s in practice, reduce prompt length. The prompt in Task 9 is already minimal. |
| MediaRecorder not supported on iOS Safari < 16 | Low | Low | V-Health therapists are likely on recent iOS. `MediaRecorder` is supported in iOS 14.5+. If it fails on an older device, the form works as a plain typed form (voice button simply stays inactive). |

---

## Hour Estimate Summary

| Task | Description | Hours |
|---|---|---|
| T1 | DB migration + shared types | 1.0 |
| T2 | Whisper + Claude + DB helpers | 1.5 |
| T3 | Telegram spike (2h timebox) | 2.0 |
| T4 | Path A — Telegram webhook route | 1.5 |
| T5 | Path B — upload + save routes | 1.5 |
| T6 | Staff intake form UI | 2.0 |
| T7 | Dashboard intake list + detail | 2.0 |
| T8 | Print stylesheet (PDF) | 0.5 |
| T9 | AI Review Assistant page | 2.0 |
| T10 | Seed data + deploy + run-through | 1.5 |
| **Total** | | **15.5 hours** |

Buffer for integration surprises, Telegram VPS setup, and demo polishing: 2–3 hours.

**Realistic total: 17–18 hours across May 13–19 (6 build days, ~3 hours/day).**

---

*Plan written: 2026-05-05. Build window: May 13–19. Demo: May 20.*
