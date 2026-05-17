# Sprint 1 — Engineering Tickets

> Sprint goal: Monorepo, database schema, auth for admin and patients, CI pipeline, Vercel deployment.
> Deliverable: Admin logs into empty dashboard shell. Patient authenticates via phone OTP and sees empty chat shell. CI green. Deployed to Vercel.
> Total: 31 points across 12 tickets.

---

### S101 — Initialize pnpm monorepo with Turborepo
**Type:** setup
**Points:** 2
**Depends on:** none

**Goal:** Establish the monorepo skeleton that every subsequent ticket builds inside.

**Scope:**
- Initialize `package.json` at repo root with `"name": "physio-os"`, `"private": true`
- Install Turborepo: `pnpm add -D turbo` at root
- Create `turbo.json` with tasks: `build`, `lint`, `typecheck`, `test`, `dev` — appropriate `dependsOn` and `outputs`
- Create workspace directories: `apps/web/`, `packages/ai-core/`, `packages/shared/`
- Add `package.json` stubs in `packages/ai-core/` and `packages/shared/`
- Root `tsconfig.base.json`: `strict: true`, `target: ES2022`, `moduleResolution: bundler`
- Root `.eslintrc.js`: extend `eslint:recommended` + `@typescript-eslint/recommended`
- Root `.prettierrc`: `{ "semi": false, "singleQuote": true, "printWidth": 100 }`
- Root `.gitignore`: `node_modules`, `.turbo`, `dist`, `.env`, `.env.local`, `coverage`, `.next`
- `.nvmrc` pinning Node 20
- `pnpm-workspace.yaml` listing `apps/*` and `packages/*`

**Acceptance criteria:**
1. `pnpm install` completes without errors and produces `pnpm-lock.yaml`
2. `ls apps/` prints `web` and `ls packages/` prints `ai-core shared`
3. `turbo.json` contains tasks for `build`, `lint`, `typecheck`, `test`
4. `tsconfig.base.json` contains `"strict": true`
5. `pnpm exec prettier --check .` exits 0

**Out of scope:**
- Installing Next.js or app-level dependencies (S103)
- CI workflow (S102)
- Any source code beyond config stubs

---

### S102 — GitHub Actions CI: lint, typecheck, and unit tests
**Type:** setup
**Points:** 2
**Depends on:** S101

**Goal:** Enforce code quality on every PR automatically.

**Scope:**
- Create `.github/workflows/ci.yml`
- Trigger on: `pull_request` (all branches) and `push` to `main`
- Steps: checkout → pnpm setup → Node 20 → `pnpm install --frozen-lockfile` → `pnpm turbo lint` → `pnpm turbo typecheck` → `pnpm turbo test`
- Cache pnpm store
- `concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }`

**Acceptance criteria:**
1. Opening a PR triggers the `ci` workflow
2. A PR with a deliberate TypeScript error fails the `typecheck` step
3. A clean PR passes all three steps
4. Workflow contains `pnpm install --frozen-lockfile`
5. Workflow contains `concurrency` with `cancel-in-progress: true`

**Out of scope:**
- Playwright E2E in CI (S6)
- Coverage gates (S6)
- Deployment steps (S111)

---

### S103 — Scaffold Next.js app in apps/web
**Type:** setup
**Points:** 2
**Depends on:** S101

**Goal:** Create the Next.js application with shadcn/ui and the UI guide's design system wired.

**Scope:**
- Scaffold Next.js (latest stable) in `apps/web` with TypeScript, Tailwind, App Router
- `apps/web/package.json`: name `@physio-os/web`; dependency `@physio-os/shared: "workspace:*"`
- Initialize shadcn/ui: New York style, CSS variables enabled
- Configure theme per UI guide:
  - Primary: `#0F766E` (teal)
  - Destructive: `#DC2626` (red)
  - Warning: `#F59E0B` (amber)
  - Success: `#16A34A` (green)
- Install and configure Inter font (via `next/font/google`)
- `apps/web/app/layout.tsx`: root layout with Inter font, `<html lang="en">`
- `apps/web/app/globals.css`: Tailwind directives + shadcn CSS variables matching UI guide colors
- Add `typecheck` and `lint` scripts to `apps/web/package.json`
- Install initial shadcn components: `button`, `card`, `input`, `badge`, `separator`, `skeleton`

**Acceptance criteria:**
1. `pnpm --filter @physio-os/web dev` starts dev server on `localhost:3000`
2. `GET localhost:3000` returns HTTP 200
3. `apps/web/components/ui/button.tsx` exists
4. `globals.css` contains `--primary` matching teal `#0F766E` (in HSL)
5. `pnpm --filter @physio-os/web typecheck` exits 0
6. Inter font loads on the page

**Out of scope:**
- Auth pages (S106, S107)
- Dashboard routes (S109)
- Chat routes (S108)

---

### S104 — Supabase project + initial schema migration
**Type:** setup
**Points:** 5
**Depends on:** S101

**Goal:** Create all database tables with correct columns, types, constraints, and indexes.

**Scope:**
- Initialize Supabase CLI: `supabase init` in repo root
- Create migration file `supabase/migrations/001_initial_schema.sql`:

```sql
-- Patients
CREATE TABLE public.patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id text NOT NULL DEFAULT 'vhealth',  -- single tenant; FK in V2
  phone text UNIQUE NOT NULL,
  name text,
  language text NOT NULL DEFAULT 'en',  -- 'en' or 'zh'
  profile jsonb DEFAULT '{}',  -- injury, diagnosis, symptoms, triggers, goals
  daily_routine jsonb DEFAULT '{}',
  sharing_enabled boolean NOT NULL DEFAULT false,
  practitioner_name text,
  consent_at timestamptz,  -- NULL = not yet consented
  opted_out boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  auth_user_id uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_patients_phone ON public.patients(phone);
CREATE INDEX idx_patients_clinic ON public.patients(clinic_id);

-- Messages
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('web', 'sms')),
  media_urls text[] DEFAULT '{}',
  twilio_sid text UNIQUE,  -- idempotency for SMS
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_messages_patient_created ON public.messages(patient_id, created_at DESC);

-- Metrics (structured data extracted from conversations)
CREATE TABLE public.metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  pain_level smallint CHECK (pain_level BETWEEN 1 AND 10),
  discomfort smallint CHECK (discomfort BETWEEN 0 AND 3),
  sitting_tolerance_min int CHECK (sitting_tolerance_min >= 0),
  exercises_done text[] DEFAULT '{}',
  exercise_count int DEFAULT 0,
  notes text,
  source_message_id uuid REFERENCES public.messages(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_metrics_patient_recorded ON public.metrics(patient_id, recorded_at DESC);

-- Weekly Reports
CREATE TABLE public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  summary text,
  metrics_summary jsonb DEFAULT '{}',
  insights text[] DEFAULT '{}',
  token text UNIQUE NOT NULL,  -- signed JWT for report URL
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(patient_id, week_start)
);
CREATE INDEX idx_reports_patient_week ON public.reports(patient_id, week_start DESC);
```

- Create seed file `supabase/seed.sql` with 3 test patients (varied languages, conditions)
- Create 5-10 test messages and 5-10 test metrics per patient for dashboard development

**Edge cases:**
- `twilio_sid` UNIQUE constraint prevents duplicate SMS processing
- `consent_at` NULL means onboarding not complete — enforce in application layer
- `opted_out = true` means system must never send outbound SMS
- All metric fields are nullable — a patient may report only pain or only discomfort
- `pain_level` CHECK constraint prevents out-of-range values at DB level

**Acceptance criteria:**
1. `supabase db reset` runs migration + seed without errors
2. `SELECT COUNT(*) FROM patients` returns 3
3. `SELECT COUNT(*) FROM messages` returns 15-30 (seeded test data)
4. `SELECT COUNT(*) FROM metrics` returns 15-30
5. `twilio_sid` unique constraint prevents duplicate inserts (test with `INSERT ... ON CONFLICT`)
6. `pain_level` CHECK rejects values outside 1-10
7. `discomfort` CHECK rejects values outside 0-3

**Out of scope:**
- RLS policies (S105)
- Supabase Auth configuration (S106, S107)
- `clinic_users` table or roles (V2)
- `scheduled_actions` table (replaced by cron logic)

---

### S105 — RLS policies: patients read own data; admin reads all
**Type:** security
**Points:** 3
**Depends on:** S104

**Goal:** Enforce data isolation at the database level.

**Scope:**
- Enable RLS on all tables: `patients`, `messages`, `metrics`, `reports`
- Patient policies (using `auth.uid()` matched to `patients.auth_user_id`):
  - `patients`: SELECT own row only
  - `messages`: SELECT/INSERT where `patient_id` matches own patient record
  - `metrics`: SELECT own only
  - `reports`: SELECT own only
- Admin policies (using service role key for server-side operations):
  - All operations on all tables via service role (bypasses RLS)
- Application-level admin check: server-side API routes use `SUPABASE_SERVICE_ROLE_KEY` for admin dashboard queries

**Edge cases:**
- Patient A cannot read Patient B's messages even if they guess the UUID
- A patient who has not completed onboarding (no `auth_user_id`) has no RLS access — data is only accessible via service role (admin)
- RLS must not significantly impact query performance on the hot path (messages by patient + date)

**Acceptance criteria:**
1. As an authenticated patient, `SELECT * FROM patients` returns exactly 1 row (their own)
2. As an authenticated patient, `SELECT * FROM messages WHERE patient_id = '<other_patient>'` returns 0 rows
3. As service role, `SELECT * FROM patients` returns all patients
4. `EXPLAIN ANALYZE` on `SELECT * FROM messages WHERE patient_id = $1 ORDER BY created_at DESC LIMIT 20` shows index usage with RLS enabled
5. An unauthenticated request returns 0 rows on all tables

**Out of scope:**
- Per-practitioner access (V2)
- `sharing_enabled` toggle enforcement (V2 — admin sees all in V1)

---

### S106 — Supabase Auth: phone OTP for patients
**Type:** auth
**Points:** 3
**Depends on:** S104

**Goal:** Patients authenticate via phone number with SMS verification code. Session persists for web chat.

**Scope:**
- Configure Supabase Auth to use Twilio as SMS provider (Supabase Dashboard → Auth → Phone Provider → Twilio)
- Set OTP expiry to 5 minutes, 6-digit code
- Create patient auth flow:
  1. Patient enters phone number → `supabase.auth.signInWithOtp({ phone })`
  2. Patient receives SMS with 6-digit code
  3. Patient enters code → `supabase.auth.verifyOtp({ phone, token, type: 'sms' })`
  4. On first sign-in, link `auth.users.id` to `patients.auth_user_id` (if patient record exists for that phone)
  5. If no patient record exists, create one (onboarding will fill profile in S2)
- Session management: default Supabase session (JWT + refresh token)
- Create `/login` page at `apps/web/app/(patient)/login/page.tsx`
- Create Supabase client utilities:
  - `apps/web/lib/supabase/client.ts` (browser client with `@supabase/ssr`)
  - `apps/web/lib/supabase/server.ts` (server client for API routes/server components)
  - `apps/web/lib/supabase/middleware.ts` (session refresh middleware)
- Add Next.js middleware to refresh session on every request

**Edge cases:**
- Phone number formatting: accept `+1XXXXXXXXXX` and `XXXXXXXXXX`, normalize to E.164
- OTP rate limiting: Supabase default (3 OTPs per phone per hour) is sufficient
- Patient with existing SMS conversations but no web account: first web login links to existing patient record by phone number
- Twilio SMS provider credentials stored in Supabase Dashboard, not in app env vars

**Acceptance criteria:**
1. Patient enters Canadian phone number → receives 6-digit OTP via SMS within 10 seconds
2. Correct OTP → patient is logged in and redirected to `/chat`
3. Incorrect OTP → error message shown, patient can retry
4. Session persists across page refreshes (cookie-based)
5. `patients.auth_user_id` is set after first login
6. Phone numbers are stored in E.164 format (`+1XXXXXXXXXX`)
7. A patient with an existing record (created via SMS onboarding) can log in and their web session links to the same record

**Out of scope:**
- Email/password auth (S107 — admin only)
- Onboarding profile collection (S2)
- STOP/opt-out handling (S3)

---

### S107 — Supabase Auth: admin email/password login
**Type:** auth
**Points:** 3
**Depends on:** S104

**Goal:** Single admin user logs in via email/password to access the clinic dashboard.

**Scope:**
- Configure admin login via Supabase Auth email/password
- Create admin account manually via Supabase Dashboard (or seed script) for V-Health admin email
- Environment variable: `ADMIN_EMAIL` — used to verify admin access
- Create `/dashboard/login` page: email + password form
- Auth guard middleware: any route under `/(clinic)/dashboard/*` checks:
  1. User is authenticated (Supabase session exists)
  2. User's email matches `ADMIN_EMAIL` env var
  3. If not → redirect to `/dashboard/login`
- Logout functionality: button in dashboard header → `supabase.auth.signOut()` → redirect to login

**Edge cases:**
- Admin and patient auth share the same Supabase Auth system but are different users
- If someone signs up with a non-admin email and tries to access `/dashboard`, they get a 403 or redirect
- Admin session should not interfere with patient session (they use different browser contexts in practice, but worth noting)

**Acceptance criteria:**
1. Admin navigates to `/dashboard` → redirected to `/dashboard/login`
2. Admin enters email + password → authenticated and redirected to `/dashboard`
3. Wrong password → error message, no login
4. Non-admin email → authenticated by Supabase but rejected by admin check → 403 page
5. Logout button → session cleared → redirected to login
6. Direct access to `/dashboard/patients` without auth → redirected to login

**Out of scope:**
- Multiple admin users (V2)
- Role-based access (V2)
- Password reset flow (manual via Supabase Dashboard for V1)

---

### S108 — Patient chat shell UI
**Type:** frontend
**Points:** 3
**Depends on:** S103, S106

**Goal:** Empty chat interface ready for AI wiring in Sprint 2.

**Scope:**
- Create route `apps/web/app/(patient)/chat/page.tsx`
- Auth guard: redirect to `/login` if not authenticated
- Chat layout following UI guide:
  - Header: V-Health logo/name + help icon
  - Message area: scrollable container, messages in `Card` components
  - AI messages: `bg-muted`, left-aligned
  - Patient messages: `bg-primary text-primary-foreground`, right-aligned
  - Input bar: large `Input` with `Button` send icon, fixed at bottom
  - Mobile-first: full-width, large tap targets (min 44px)
- Static mock messages to verify layout (2-3 hardcoded messages for visual QA)
- Loading state: `Skeleton` components for message loading
- Empty state: welcome message explaining what the coach does
- Scrolls to bottom on load and new messages
- Input field: `Enter` to send (desktop), send button (mobile), disabled when empty

**Edge cases:**
- Very long messages should wrap, not overflow
- Message area should scroll when messages exceed viewport height
- On mobile, keyboard opening should not obscure the input field
- Empty input → send button disabled

**Acceptance criteria:**
1. `/chat` renders with header, message area, and input bar
2. Mock messages display in correct alignment (AI left, patient right)
3. Input field accepts text; `Enter` key triggers send action (console log for now)
4. Send button is disabled when input is empty
5. Page is mobile-responsive at 375px viewport
6. Skeleton loading state renders correctly
7. Message area scrolls to bottom on load
8. WCAG AA: contrast ratio ≥ 4.5:1 on all text

**Out of scope:**
- AI integration (S2)
- Streaming responses (S2)
- Metric badge rendering (S2)
- Chat history persistence (S2)

---

### S109 — Admin dashboard shell UI
**Type:** frontend
**Points:** 3
**Depends on:** S103, S107

**Goal:** Empty dashboard layout ready for data in Sprint 5.

**Scope:**
- Create route group `apps/web/app/(clinic)/dashboard/`
- Layout with sidebar navigation (shadcn sidebar pattern):
  - Sidebar items: "Patients" (default), "Settings"
  - V-Health branding in sidebar header
  - Collapsible on desktop; Sheet/drawer on mobile
- Pages (all empty states with placeholder content):
  - `/dashboard` → redirects to `/dashboard/patients`
  - `/dashboard/patients` → "No patients yet" empty state
  - `/dashboard/patients/[id]` → patient detail placeholder
  - `/dashboard/settings` → settings placeholder
- Dashboard header: "V-Health Dashboard" + admin avatar/menu with logout
- Responsive: sidebar collapses to bottom nav or hamburger on tablet/mobile

**Edge cases:**
- Sidebar active state should highlight current route
- Mobile sidebar should close on navigation
- Dashboard layout should not conflict with patient chat layout (separate route groups)

**Acceptance criteria:**
1. `/dashboard` redirects to `/dashboard/patients`
2. Sidebar renders with "Patients" and "Settings" items
3. Clicking sidebar items navigates correctly
4. Mobile (375px): sidebar is hidden; hamburger opens Sheet
5. Tablet (768px): sidebar is collapsible
6. Auth guard blocks unauthenticated access
7. Admin header shows logout button that works
8. Empty states show appropriate placeholder messages

**Out of scope:**
- Patient list with real data (S5)
- Patient detail with charts (S5)
- Settings functionality (V2)
- Alert badges (S5)

---

### S110 — Shared types package
**Type:** setup
**Points:** 2
**Depends on:** S101, S104

**Goal:** Create shared TypeScript types and Supabase generated types used by all packages.

**Scope:**
- `packages/shared/package.json`: name `@physio-os/shared`
- `packages/shared/src/database.types.ts`: generated via `supabase gen types typescript`
- `packages/shared/src/types.ts`: domain types:
  ```typescript
  // Patient profile shape (stored in patients.profile jsonb)
  interface PatientProfile {
    injury?: string
    diagnosis?: string
    symptoms?: string
    triggers?: string[]
    goals?: string[]
    treatmentPlan?: string
    practitionerName?: string
    practitionerFrequency?: string
  }

  // Metric extraction result (from AI tool call)
  interface MetricExtraction {
    painLevel?: number      // 1-10
    discomfort?: number     // 0-3
    sittingToleranceMin?: number
    exercisesDone?: string[]
    exerciseCount?: number
    notes?: string
  }

  // Channel type
  type Channel = 'web' | 'sms'

  // Message role
  type MessageRole = 'user' | 'assistant' | 'system'
  ```
- `packages/shared/src/metrics.ts`: metric definitions and validation:
  ```typescript
  const PAIN_SCALE = { min: 1, max: 10, label: 'Pain Level' }
  const DISCOMFORT_SCALE = { min: 0, max: 3, labels: ['None', 'Mild', 'Moderate', 'Severe'] }
  ```
- `packages/shared/src/index.ts`: barrel export
- `packages/shared/tsconfig.json`: extends root `tsconfig.base.json`
- Add `gen:types` script to root `package.json`: `supabase gen types typescript --linked > packages/shared/src/database.types.ts`

**Acceptance criteria:**
1. `import { PatientProfile, MetricExtraction } from '@physio-os/shared'` works in `apps/web`
2. `database.types.ts` contains generated types matching all tables from S104
3. `pnpm turbo typecheck` passes with shared types imported in web app
4. Metric validation functions correctly reject out-of-range values

**Out of scope:**
- AI-specific types (S2 — in `packages/ai-core`)
- Twilio types (S3)

---

### S111 — Vercel project setup
**Type:** setup
**Points:** 2
**Depends on:** S103

**Goal:** Vercel deployment pipeline working with preview deploys on every PR.

**Scope:**
- Create Vercel project linked to GitHub repo
- Configure build command: `cd apps/web && pnpm build` (or Turborepo-aware)
- Set root directory to `apps/web` or configure monorepo settings
- Add environment variables in Vercel:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `ANTHROPIC_API_KEY`
  - `ADMIN_EMAIL`
  - `NEXT_PUBLIC_APP_URL`
  - `REPORT_TOKEN_SECRET`
- Verify: push to `main` → production deploy succeeds
- Verify: PR → preview deploy URL works
- Create `vercel.json` (minimal, placeholder for cron config in S4)

**Acceptance criteria:**
1. Push to `main` triggers Vercel production deploy
2. Production deploy succeeds and app loads
3. PR creates preview deploy with unique URL
4. Environment variables are accessible in the app
5. Supabase client can connect from deployed app

**Out of scope:**
- Custom domain (S6 — vhealth.ai)
- Cron configuration (S4)
- Sentry integration (S5)

---

### S112 — Vitest setup + initial tests
**Type:** testing
**Points:** 1
**Depends on:** S101, S110

**Goal:** Test infrastructure established with patterns for future tickets.

**Scope:**
- Configure Vitest at root level with workspace support
- `vitest.config.ts` at root: test `packages/shared` and `packages/ai-core`
- Initial test file: `packages/shared/src/__tests__/metrics.test.ts`
  - Test metric validation (pain range, discomfort range, sitting tolerance non-negative)
  - Test phone number normalization helper (various input formats → E.164)
- Create test utilities: `packages/shared/src/test-utils.ts` (mock patient, mock message factories)

**Acceptance criteria:**
1. `pnpm test` runs Vitest and passes
2. `pnpm turbo test` runs tests across workspaces
3. At least 3 test cases passing (metric validation, phone normalization)
4. Test factories generate valid mock data matching DB schema

**Out of scope:**
- Coverage gates (S6)
- Playwright E2E (S6)
- Integration tests with real Supabase (future sprints)
