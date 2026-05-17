# Sprint 1 — Code Review & Audit

> **Reviewer:** Tech Lead / Code Auditor
> **Scope:** All files in commit `8bd2a49` — `[s1] feat: Sprint 1 — foundation, auth, schema, and dashboard shell`
> **Date:** 2026-04-02
> **Verdict:** Solid foundation with several issues that must be addressed before Sprint 2 begins. One critical bug (middleware not wired), one critical hygiene issue (duplicate lockfile), and multiple medium-severity items that will compound into tech debt if deferred.

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 2     |
| High     | 3     |
| Medium   | 6     |
| Low      | 6     |

---

## Critical

### R001 — Next.js middleware is not wired — auth guards are non-functional

**File:** `apps/web/proxy.ts`

**Problem:**
The file is named `proxy.ts` and exports a function named `proxy`. Next.js requires the middleware file to be named `middleware.ts` (or `middleware.js`) at the project root (`apps/web/middleware.ts`) and must export a named `middleware` function or a default export. Because neither the filename nor the export name matches the convention, **the middleware never runs**. This means:

- `/chat` is accessible without authentication
- `/dashboard/*` is accessible without admin login
- Session refresh via `updateSession()` never fires
- The entire auth guard system (S106, S107) is effectively disabled

**Why it matters:** This is a security hole. Any unauthenticated user can access patient chat and the admin dashboard directly.

**Steps:**
1. Rename `apps/web/proxy.ts` → `apps/web/middleware.ts`
2. Rename the exported function from `proxy` to `middleware`
3. Verify the `config.matcher` pattern is correct for Next.js 16
4. Test: unauthenticated `GET /chat` → redirects to `/login`
5. Test: unauthenticated `GET /dashboard` → redirects to `/dashboard/login`
6. Test: authenticated non-admin `GET /dashboard` → redirected with `?error=unauthorized`

**Acceptance:**
- File is `apps/web/middleware.ts` with `export function middleware(...)`
- All auth guard redirects confirmed working via browser or integration test

---

### R002 — Duplicate lockfile in apps/web breaks monorepo integrity

**File:** `apps/web/pnpm-lock.yaml` (6130 lines)

**Problem:**
A pnpm workspace monorepo must have exactly one `pnpm-lock.yaml` at the root. The presence of `apps/web/pnpm-lock.yaml` means someone ran `pnpm install` inside `apps/web/` directly, creating a separate dependency tree. This causes:

- Possible version mismatches between root and app-level dependencies
- CI installs from root lockfile but local dev may resolve differently
- Turborepo cache invalidation becomes unreliable
- The file is 6130 lines of committed noise

**Steps:**
1. Delete `apps/web/pnpm-lock.yaml`
2. Add `apps/web/pnpm-lock.yaml` to `.gitignore` (or just `**/pnpm-lock.yaml` with `!pnpm-lock.yaml` at root)
3. Run `pnpm install` from repo root to ensure root lockfile is complete
4. Verify `pnpm turbo build` passes from root

**Acceptance:**
- Only one `pnpm-lock.yaml` exists (at repo root)
- `pnpm install && pnpm turbo build` passes cleanly from root

---

## High

### R003 — Missing `updated_at` trigger on patients table

**File:** `supabase/migrations/001_initial_schema.sql`

**Problem:**
The `patients` table has `updated_at timestamptz NOT NULL DEFAULT now()` but there is no database trigger to automatically update this column when a row is modified. Every application-level UPDATE must manually set `updated_at = now()`, which is:

- Error-prone (easy to forget in any of the many places that update patients)
- Inconsistent (service role updates, RPC calls, and direct queries all need to remember)
- A data integrity risk (stale `updated_at` values will break "last active" queries in S5 dashboard)

**Steps:**
1. Create a new migration `003_updated_at_trigger.sql`
2. Add a reusable trigger function:
   ```sql
   CREATE OR REPLACE FUNCTION public.set_updated_at()
   RETURNS TRIGGER AS $$
   BEGIN
     NEW.updated_at = now();
     RETURN NEW;
   END;
   $$ LANGUAGE plpgsql;
   ```
3. Attach to patients table:
   ```sql
   CREATE TRIGGER trg_patients_updated_at
     BEFORE UPDATE ON public.patients
     FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
   ```
4. Run `supabase db reset` and verify `updated_at` changes on UPDATE

**Acceptance:**
- `UPDATE patients SET name = 'x' WHERE id = '...'` automatically updates `updated_at`
- Trigger function is reusable for future tables

---

### R004 — Dark mode theme loses teal brand identity

**File:** `apps/web/app/globals.css`

**Problem:**
In light mode, `--primary` is set to `oklch(0.485 0.105 175)` (teal, matching the `#0F766E` brand color). But in dark mode, `--primary` is `oklch(0.922 0 0)` — a neutral grey. This means the entire brand color disappears in dark mode. Every `text-primary`, `bg-primary`, `border-primary` element reverts to grey.

The sidebar dark mode also diverges: `--sidebar-primary: oklch(0.488 0.243 264.376)` — a blue/purple that doesn't match the teal brand at all.

**Steps:**
1. Define a dark-mode teal: e.g., `oklch(0.65 0.12 175)` (lighter teal for dark backgrounds)
2. Update `.dark` block: `--primary: oklch(0.65 0.12 175)`
3. Update `.dark` `--sidebar-primary` to match the teal palette
4. Visually verify primary buttons, links, and sidebar in dark mode maintain teal identity
5. Verify contrast ratio ≥ 4.5:1 against dark background (`oklch(0.145 0 0)`)

**Acceptance:**
- Primary color is recognizably teal in both light and dark modes
- WCAG AA contrast met for primary text on dark background

---

### R005 — `normalizePhone` lacks input validation and has unsafe fallback

**File:** `packages/shared/src/metrics.ts`

**Problem:**
`normalizePhone` strips non-digits and applies formatting rules, but:

1. It never validates input — `normalizePhone("abc")` returns `"+"` (empty digits after `+`)
2. `normalizePhone("")` returns `"+"`
3. `normalizePhone("123")` returns `"+123"` — an invalid E.164 number
4. The final fallback `return \`+${digits}\`` accepts any digit count, producing invalid numbers that Twilio will reject
5. Only North American (+1) numbers are handled — no validation for country codes

Since this function is used directly in the OTP login flow (`PatientLoginForm`), invalid inputs will cause confusing Supabase/Twilio errors instead of a clear validation message.

**Steps:**
1. Add a `isValidPhone(phone: string): boolean` validation function
2. `normalizePhone` should throw or return a `Result` type for invalid input
3. Validate minimum 10 digits, maximum 15 digits (E.164 spec)
4. Validate result starts with `+` and country code
5. Add phone validation in `PatientLoginForm` before calling `signInWithOtp`
6. Add test cases for edge cases: empty string, letters only, too few digits, too many digits

**Acceptance:**
- `normalizePhone("")` throws or returns error
- `normalizePhone("abc")` throws or returns error
- `normalizePhone("123")` throws or returns error
- `PatientLoginForm` shows validation error before sending OTP for invalid phone
- Test coverage for all edge cases

---

## Medium

### R006 — No linting on shared packages; no root ESLint config

**Files:** `packages/shared/package.json`, `packages/ai-core/package.json`

**Problem:**
Both shared packages have `"lint": "echo 'no lint configured'"`. The S101 ticket specified a root `.eslintrc.js` extending `eslint:recommended` + `@typescript-eslint/recommended`, but no root ESLint config exists. Only `apps/web` has linting. This means:

- `pnpm turbo lint` silently passes for packages without catching any issues
- Code in `packages/shared/` and `packages/ai-core/` has zero lint enforcement
- As S2 adds AI core logic, it will accumulate unlinted code

**Steps:**
1. Create a root `eslint.config.mjs` with TypeScript recommended rules
2. Configure both packages to extend the root config
3. Replace `"echo 'no lint configured'"` with actual `eslint` commands
4. Add `eslint` as a devDependency to each package (or use root-level)
5. Run `pnpm turbo lint` and fix any issues found

**Acceptance:**
- `pnpm turbo lint` runs real linting on all three workspaces
- No `echo` stubs remain in lint scripts

---

### R007 — Supabase client instantiated on every render in DashboardShell

**File:** `apps/web/app/(clinic)/dashboard/dashboard-shell.tsx`

**Problem:**
```tsx
export function DashboardShell({ children }: { children: React.ReactNode }) {
  const supabase = createClient()  // called every render
```

`createClient()` from `@supabase/ssr` creates a new `BrowserClient` on every render of this component. While Supabase SSR clients are lightweight, creating a new instance per render is wasteful and unconventional. The `handleLogout` function captures a potentially stale reference.

**Steps:**
1. Move `createClient()` inside `handleLogout` (only needed there), or
2. Wrap in `useMemo` / extract to a custom hook that creates the client once
3. Consider a shared `useSupabase()` hook for the entire app to ensure singleton pattern

**Acceptance:**
- `createClient()` is not called on every render cycle
- Logout still functions correctly

---

### R008 — Non-null assertions on env vars with no runtime validation

**Files:** `apps/web/lib/supabase/client.ts`, `apps/web/lib/supabase/server.ts`, `apps/web/lib/supabase/middleware.ts`

**Problem:**
All Supabase utilities use `process.env.NEXT_PUBLIC_SUPABASE_URL!` and similar non-null assertions. If any env var is missing (common in CI, new developer setup, or misconfigured Vercel deployment), the error will be a cryptic Supabase initialization failure rather than a clear "missing env var" message.

**Steps:**
1. Create `apps/web/lib/env.ts` with validated env access:
   ```typescript
   function requireEnv(name: string): string {
     const value = process.env[name]
     if (!value) throw new Error(`Missing required environment variable: ${name}`)
     return value
   }
   ```
2. Use `requireEnv()` in all Supabase client files
3. Optionally add a build-time env check using `@t3-oss/env-nextjs` or similar

**Acceptance:**
- Missing `NEXT_PUBLIC_SUPABASE_URL` produces error: `"Missing required environment variable: NEXT_PUBLIC_SUPABASE_URL"`
- No `!` non-null assertions remain on `process.env` access

---

### R009 — Redundant index on `patients.phone`

**File:** `supabase/migrations/001_initial_schema.sql`

**Problem:**
```sql
phone text UNIQUE NOT NULL,
...
CREATE INDEX idx_patients_phone ON public.patients(phone);
```
The `UNIQUE` constraint on `phone` automatically creates a unique B-tree index. The explicit `CREATE INDEX idx_patients_phone` creates a second, redundant index on the same column. This wastes storage and slows down INSERTs/UPDATEs with no query benefit.

**Steps:**
1. Create migration `003_drop_redundant_index.sql`:
   ```sql
   DROP INDEX IF EXISTS public.idx_patients_phone;
   ```
2. Verify `EXPLAIN ANALYZE SELECT * FROM patients WHERE phone = '+16041234567'` still uses the unique constraint index

**Acceptance:**
- Only one index exists on `patients.phone` (the unique constraint index)
- Phone lookups still use index scan

---

### R010 — `shadcn` CLI listed as runtime dependency

**File:** `apps/web/package.json`

**Problem:**
```json
"dependencies": {
  "shadcn": "^4.1.2",
```
`shadcn` is a CLI tool used to scaffold components (`npx shadcn add button`). It should never be a runtime dependency — it adds ~5MB to the production bundle analysis and gets included in the deployment. It belongs in `devDependencies`.

**Steps:**
1. Move `shadcn` from `dependencies` to `devDependencies` in `apps/web/package.json`
2. Run `pnpm install` from root
3. Verify `pnpm turbo build` still succeeds (shadcn is not imported at runtime)

**Acceptance:**
- `shadcn` is in `devDependencies` only
- Build passes; app runs normally

---

### R011 — Chat page setTimeout not cleared on unmount

**File:** `apps/web/app/(patient)/chat/page.tsx`

**Problem:**
```tsx
setTimeout(() => {
  setMessages((prev) => [...prev, { ... }])
  setLoading(false)
}, 1000)
```
This timeout is never cleaned up. If the user navigates away from `/chat` within 1 second of sending a message, React will warn about setting state on an unmounted component. While this is mock code for S1, it sets a bad pattern that S2 AI integration will likely copy.

**Steps:**
1. Store the timeout ref: `const timeoutRef = useRef<NodeJS.Timeout>()`
2. Clear on unmount:
   ```tsx
   useEffect(() => {
     return () => clearTimeout(timeoutRef.current)
   }, [])
   ```
3. Or replace with `useEffect` + abort pattern that S2 AI streaming will need anyway

**Acceptance:**
- No React state-update-on-unmounted-component warning when navigating away during loading
- Pattern is ready for S2 replacement with real async logic

---

## Low

### R012 — CI workflow should reference `.nvmrc` instead of hardcoding Node version

**File:** `.github/workflows/ci.yml`

**Problem:**
CI hardcodes `node-version: 20` while `.nvmrc` also specifies `20`. If the project upgrades Node, two files need updating. The `setup-node` action supports `node-version-file`.

**Steps:**
1. Replace `node-version: 20` with `node-version-file: '.nvmrc'`

**Acceptance:**
- CI reads Node version from `.nvmrc`

---

### R013 — `apps/web/tsconfig.json` does not extend `tsconfig.base.json`

**File:** `apps/web/tsconfig.json`

**Problem:**
The root `tsconfig.base.json` sets `target: ES2022`, `strict: true`, and other shared options. But `apps/web/tsconfig.json` defines its own standalone config with `target: ES2017`. This means:
- The web app targets an older JS version than the rest of the monorepo
- Shared compiler options can drift between packages

This is partially expected (Next.js generates its own tsconfig), but the `target` mismatch with `tsconfig.base.json` should be intentional and documented.

**Steps:**
1. Evaluate whether `apps/web/tsconfig.json` should extend `../../tsconfig.base.json` with overrides
2. If not extending (Next.js convention), add a comment explaining the intentional divergence
3. Ensure `strict: true` is maintained (it is currently — good)

**Acceptance:**
- Either extends base config with overrides, or divergence is documented

---

### R014 — OTP input allows non-numeric characters

**File:** `apps/web/app/(patient)/login/login-form.tsx`

**Problem:**
The OTP input uses `type="text"` with `inputMode="numeric"`, but there's no `pattern` attribute and no `onChange` filtering. Users can type letters, which will always fail verification.

**Steps:**
1. Add `pattern="[0-9]*"` to the input
2. Filter non-numeric characters in `onChange`: `setOtp(e.target.value.replace(/\D/g, ''))`

**Acceptance:**
- OTP field only accepts digits 0-9
- Pasting "abc123" results in "123" in the field

---

### R015 — Missing `gen:types` script per S110 spec

**File:** `package.json` (root)

**Problem:**
S110 specifies a `gen:types` script in the root `package.json`: `supabase gen types typescript --linked > packages/shared/src/database.types.ts`. This script is missing, so regenerating types after schema changes requires manual commands.

**Steps:**
1. Add to root `package.json` scripts:
   ```json
   "gen:types": "supabase gen types typescript --linked > packages/shared/src/database.types.ts"
   ```
2. Document in README when to run this command

**Acceptance:**
- `pnpm gen:types` regenerates `database.types.ts` from linked Supabase project

---

### R016 — `Date.now()` message IDs can collide

**File:** `apps/web/app/(patient)/chat/page.tsx`

**Problem:**
```tsx
const userMsg: Message = { id: Date.now().toString(), ... }
```
Two messages sent within the same millisecond will share an ID. This is unlikely in normal usage but can happen in automated tests or rapid double-clicks. React will warn about duplicate keys.

**Steps:**
1. Use `crypto.randomUUID()` instead of `Date.now().toString()`

**Acceptance:**
- Message IDs are guaranteed unique

---

### R017 — No tests for mock factories per S112 acceptance criteria

**File:** `packages/shared/src/test-utils.ts`

**Problem:**
S112 acceptance criteria #4: "Test factories generate valid mock data matching DB schema." No tests exist for `mockPatient()`, `mockMessage()`, or `mockMetric()`. While the factories are simple, validating that defaults match DB constraints (e.g., `pain_level` within 1-10, `channel` is 'web'|'sms') ensures they stay in sync as the schema evolves.

**Steps:**
1. Add `packages/shared/src/__tests__/test-utils.test.ts`
2. Test each factory returns valid data (required fields present, constraints met)
3. Test override merging works correctly

**Acceptance:**
- `mockPatient()` returns a valid `PatientRow` with all required fields
- `mockMetric()` returns valid pain_level and discomfort values
- Override parameter works: `mockPatient({ name: 'X' }).name === 'X'`

---

## Observations (non-blocking, for awareness)

1. **Single admin email check** — The admin guard compares `user.email === process.env.ADMIN_EMAIL`. This is fragile for V2 multi-admin, but acceptable for V1 single-tenant scope.

2. **RLS subquery pattern** — Policies use `patient_id IN (SELECT id FROM patients WHERE auth_user_id = auth.uid())` repeatedly. Consider extracting to a `SECURITY DEFINER` function in a future migration for DRYness and potential perf improvement.

3. **`createServiceClient` uses dynamic import** — `const { createClient } = await import('@supabase/supabase-js')` is unusual. A static import would be cleaner, but this avoids bundling `supabase-js` in the client bundle. Acceptable trade-off, but add a comment explaining why.

4. **`force-dynamic` on dashboard layout** — `export const dynamic = 'force-dynamic'` on the layout means every dashboard page is SSR'd on every request. This is correct for auth-gated pages but worth revisiting in S5 when dashboard gets real data (consider per-page caching).

5. **`@base-ui/react` dependency** — Used by shadcn base-nova style components. Verified it's a legitimate dependency (used in button, input, sidebar, tooltip, avatar, badge, separator, sheet).

6. **Seed data quality** — Seed SQL is well-crafted with realistic patient data, bilingual content, and varied scenarios. Good job.

---

## Recommended Priority Order

| Order | Ticket | Effort | Sprint |
|-------|--------|--------|--------|
| 1     | R001 — Fix middleware  | 15 min | Before S2 |
| 2     | R002 — Delete duplicate lockfile | 5 min  | Before S2 |
| 3     | R005 — Phone validation | 1 hr   | Before S2 |
| 4     | R003 — updated_at trigger | 30 min | S2 start |
| 5     | R010 — shadcn to devDeps | 5 min  | S2 start |
| 6     | R008 — Env var validation | 30 min | S2 start |
| 7     | R011 — Chat setTimeout cleanup | 15 min | S2 (chat rework) |
| 8     | R004 — Dark mode teal | 30 min | S2 or S3 |
| 9     | R007 — Supabase client per render | 15 min | S2 |
| 10    | R009 — Redundant index | 5 min  | S2 |
| 11    | R006 — Package linting | 1 hr   | S2 |
| 12    | R012 — CI .nvmrc | 5 min  | Anytime |
| 13    | R013 — tsconfig divergence | 15 min | Anytime |
| 14    | R014 — OTP numeric filter | 10 min | S2 |
| 15    | R015 — gen:types script | 5 min  | S2 start |
| 16    | R016 — Message ID collision | 5 min  | S2 (chat rework) |
| 17    | R017 — Factory tests | 30 min | S2 |

**R001 and R002 are blockers and should be fixed immediately before any S2 work begins.**
