# PhysioOS — Sprint Plan (V1)

> Produced by: CEO Review + PM Review + Tech Lead Review
> Solo developer + AI agents. 6 sprints x 1 week = 6 weeks to V1.
> Story points: 1=trivial, 2=half day, 3=full day, 5=1-2 days, 8=3-4 days

---

## Critical Path

```
Monorepo + Schema + Auth (S1) → AI engine + web chat + onboarding (S2)
→ SMS + metric extraction + MMS (S3) → Weekly reports + nudges + patterns (S4)
→ Clinic dashboard (S5) → Safety testing + compliance + launch (S6)
```

**Highest-risk item:** Twilio SMS webhook → Claude API → Twilio reply async flow. Twilio webhook times out at 15s; Claude may take longer. Must validate async reply pattern on Day 1 of Sprint 3.

---

## Architecture Decisions (Resolved)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Monorepo | pnpm workspaces + Turborepo | Proven pattern from drop-note |
| Multi-tenant | Single-tenant V1; `clinic_id` FK for V2 | No routing/RLS/config complexity |
| AI provider | Claude via Vercel AI SDK, no abstraction layer | Single provider; streaming + tool calling built in |
| Patient auth | Supabase Auth phone OTP | Built-in session management |
| Admin auth | Supabase Auth email/password; `ADMIN_EMAIL` env var check | Simplest RBAC for one admin |
| SMS | Twilio webhook → async process → Twilio REST API reply | Avoids webhook timeout |
| Context window | ~4K tokens history + patient profile | Predictable cost/quality |
| Cron | Vercel Cron; daily + weekly jobs check all patients | No scheduler engine needed |
| Packages | `apps/web`, `packages/ai-core`, `packages/shared` | No separate sms package |
| Charts | Recharts via shadcn/ui charts | In-ecosystem |
| Timezone | Hard-code America/Vancouver | Single clinic |
| Local dev SMS | ngrok tunnel | Standard Twilio approach |

---

## Sprint 1 — Foundation & Schema
**Goal:** Monorepo, database schema, auth for admin and patients, CI, Vercel deployment.
**Deliverable:** Admin logs into empty dashboard shell. Patient authenticates via phone OTP and sees empty chat shell. CI green. Deployed to Vercel.

| # | Task | Points | Notes |
|---|------|--------|-------|
| 1.1 | Initialize pnpm monorepo + Turborepo: `apps/web`, `packages/ai-core`, `packages/shared` | 2 | Root tsconfig, ESLint, Prettier, .nvmrc Node 20 |
| 1.2 | GitHub Actions CI: lint, typecheck, Vitest on every PR | 2 | Cache pnpm store; concurrency cancel |
| 1.3 | Scaffold Next.js app (`apps/web`): TypeScript, App Router, shadcn/ui, Tailwind, Inter font | 2 | Configure shadcn theme per UI guide (teal primary `#0F766E`) |
| 1.4 | Supabase project + initial schema migration | 5 | `patients`, `messages`, `metrics`, `reports` tables. `clinic_id` FK (hard-coded single value). Seed 3 test patients. |
| 1.5 | RLS policies: patients read own data; admin reads all | 3 | Cover patients, messages, metrics. Admin via service role or JWT email check. |
| 1.6 | Supabase Auth: phone OTP for patients (configure Twilio as SMS provider) | 3 | Test round-trip with real Canadian phone number |
| 1.7 | Supabase Auth: email/password for admin; admin layout with auth guard | 3 | Protected `/dashboard` route group. Check `ADMIN_EMAIL` env var. |
| 1.8 | Patient chat shell: auth layout, empty chat UI with message input, mobile-first | 3 | shadcn Card for bubbles per UI guide. Streaming-ready. |
| 1.9 | Admin dashboard shell: sidebar nav, empty patient list, empty patient detail | 3 | Collapsible sidebar → bottom nav on mobile per UI guide. |
| 1.10 | Shared types package: Supabase generated types, domain types (Patient, Message, Metric) | 2 | `packages/shared`. `supabase gen types`. |
| 1.11 | Vercel project setup: link repo, env vars, confirm preview deploys | 2 | Supabase + app env vars. |
| 1.12 | Vitest setup + initial tests for shared types/helpers | 1 | Establish test patterns. |

**Sprint 1 Total: 31 points**

---

## Sprint 2 — AI Engine & Web Chat
**Goal:** Working AI conversation via web chat. Claude responds bilingually within guardrails. Onboarding captures patient profile + consent.
**Deliverable:** Patient signs up, completes onboarding, chats with AI recovery coach on web. Conversations saved. Guardrails enforced.

| # | Task | Points | Notes |
|---|------|--------|-------|
| 2.1 | AI engine core (`packages/ai-core/engine.ts`): Vercel AI SDK + Claude, streaming, tool calling | 5 | `streamText()` with system prompt, message history, tool definitions |
| 2.2 | System prompt: recovery coach persona, guardrails (7 rules), bilingual behavior, SMS-short mode | 3 | Separate SMS variant with length constraint. Language-matching rules. |
| 2.3 | Context builder: load patient profile + token-budgeted history (~4K tokens) from Supabase | 3 | Always include full profile. Trim oldest messages first. |
| 2.4 | `/api/chat` route: Vercel AI SDK `useChat`-compatible; auth check; persist messages to DB | 3 | Stream to client; save user + assistant messages. |
| 2.5 | Web chat UI: wire `useChat` hook, streaming, message history on load, metric badge rendering | 5 | Scroll to bottom, loading/error states. Inline metric badges. |
| 2.6 | Patient onboarding: consent capture + 3-question profile (name, condition, language) | 3 | Consent message with privacy policy link. STOP opt-out. Records consent timestamp. |
| 2.7 | AI safety classifier (`packages/ai-core/safety.ts`): emergency keywords, off-topic detection | 2 | Keyword + pattern matching. Claude classification for ambiguous. |
| 2.8 | AI failure fallback: Claude API error → user-friendly message; retry logic for transient failures | 2 | "I'm having trouble responding. Try again in a moment, or call V-Health at [number]." |
| 2.9 | Manual guardrail testing: 20+ adversarial prompts tested and documented | 2 | Not automated yet (S6). Document results. |
| 2.10 | Unit tests: context builder, safety classifier, message persistence | 2 | Mock Claude API. |

**Sprint 2 Total: 30 points**

---

## Sprint 3 — SMS Integration & Metric Extraction
**Goal:** Full SMS loop working. Metrics extracted from conversations and stored. MMS images handled.
**Deliverable:** Patient texts Twilio number → gets AI reply. Pain/discomfort/exercises extracted and stored. Web and SMS share history.

| # | Task | Points | Notes |
|---|------|--------|-------|
| 3.1 | Twilio setup: Canadian number, webhook config, ngrok for local dev | 2 | Document setup for future reference |
| 3.2 | `/api/sms` webhook: receive POST, validate signature, parse body + media, identify patient by phone | 5 | Return 200 immediately. Process async. Unknown numbers → onboarding. |
| 3.3 | Async SMS reply: process through AI engine, send reply via Twilio REST API | 5 | Handles Claude latency >15s gracefully. Retry on failure. |
| 3.4 | SMS response formatting: system prompt short-mode; truncate + web link if over 280 chars | 2 | Channel-specific system prompt additions. |
| 3.5 | MMS image handling: download from Twilio media URL, store in Supabase Storage, pass to Claude vision | 3 | Image context included in conversation. |
| 3.6 | `log_metrics` AI tool: Claude calls to extract pain, discomfort, sitting tolerance, exercises | 5 | Vercel AI SDK tool definition. Writes to metrics table. Returns confirmation. |
| 3.7 | `get_history` AI tool: retrieve last 7 days of metrics for trend context | 2 | AI can reference: "your discomfort has been averaging 1.8 this week" |
| 3.8 | Unified message storage: both channels in same table with `channel` field | 2 | Patient sees full history on web regardless of originating channel. |
| 3.9 | SMS opt-in/opt-out: STOP/START/HELP compliance (CASL + carrier) | 1 | Configure Twilio Advanced Opt-Out. |
| 3.10 | Twilio idempotency: check message SID before processing to prevent duplicates | 1 | Simple DB check. |
| 3.11 | Unit tests: Twilio signature validation, SMS formatting, tool calls, idempotency | 2 | Mock Twilio payloads. |

**Sprint 3 Total: 30 points**

---

## Sprint 4 — Weekly Reports & Active Features
**Goal:** System-initiated features: weekly reports, inactivity nudges, pattern detection, SMS cost tracking.
**Deliverable:** Weekly report pages with charts. Patients get nudges. AI detects patterns. Admin sees SMS spend.

| # | Task | Points | Notes |
|---|------|--------|-------|
| 4.1 | Report generation: AI summarizes 7 days of metrics + conversations → narrative + structured summary | 5 | `generate_report` in ai-core. Stores in `reports` table. |
| 4.2 | Report web page (`/report/[token]`): mobile-first, signed JWT URL, metric cards, Recharts charts | 5 | No auth. Follow UI guide exactly: large metric numbers, trend arrows, progress bars. |
| 4.3 | Report SMS delivery: short summary (1-2 sentences) + link to web report | 2 | Vercel Cron Sunday 9am PST. |
| 4.4 | Inactivity nudge: daily cron checks patients with 3+ days no messages; sends personalized SMS | 3 | Claude generates nudge (not template). Max 1 nudge per inactive period. |
| 4.5 | Pattern detection: analyze 2+ weeks of metrics for correlations during report generation | 5 | Insight stored in `reports.insights`. Surfaced in weekly report and dashboard. |
| 4.6 | Conversational progress query: "how am I doing?" → AI uses `get_history` to give trend summary | 2 | Prompt engineering using existing tool. |
| 4.7 | Vercel Cron config: `vercel.json` entries for weekly report + daily nudge | 1 | Secure with `CRON_SECRET` env var. |
| 4.8 | SMS cost tracking: log segments per month; admin endpoint to check spend | 2 | Twilio usage API or local counter. Alert at $40. |
| 4.9 | Report "Open Chat" CTA linking to web chat | 1 | Deep link with auth redirect. |
| 4.10 | Tests: report generation, cron handlers, nudge logic, pattern detection | 3 | Mock Claude for report gen. Test cron auth. |

**Sprint 4 Total: 29 points**

---

## Sprint 5 — Clinic Dashboard
**Goal:** Admin dashboard fully functional: patient list, detail views, metrics charts, alerts, patient management.
**Deliverable:** Admin sees all patients with status, drills into detail with charts, gets alert badges.

| # | Task | Points | Notes |
|---|------|--------|-------|
| 5.1 | Patient list: name, last activity, status badge (active/inactive/alert), days logged this week | 3 | Server component. Sort by last activity. Search by name. |
| 5.2 | Patient detail: profile + metric history chart (pain, discomfort over time, Recharts) | 5 | Date range selector. Mobile-responsive. |
| 5.3 | Patient detail: conversation log viewer (read-only, paginated, channel filter) | 3 | Admin sees full chat history. |
| 5.4 | Patient detail: weekly reports list + latest insights | 2 | Link to report pages. Insights inline. |
| 5.5 | Alert system: pain spike detection (>2 above 7-day avg) → red badge on patient list | 3 | Computed at query time. Simple threshold. |
| 5.6 | Inactive patient indicators: amber badge for 5+ days no activity | 2 | Query-time computation. |
| 5.7 | Patient management: add patient (name, phone, language), edit profile, toggle active/inactive | 3 | Admin form. Creates record + sends welcome SMS. |
| 5.8 | "Send check-in" button: practitioner triggers SMS to patient from clinic number | 2 | PM recommendation. Closes the engagement loop. |
| 5.9 | Dashboard overview cards: total patients, active this week, messages this week, avg discomfort trend | 2 | Aggregate queries. Suspense boundaries. |
| 5.10 | Sentry integration: `@sentry/nextjs` error tracking | 2 | DSN in env vars. Source maps on build. |
| 5.11 | Mobile responsiveness pass: sidebar → bottom nav, cards at small viewports | 2 | shadcn Sheet for mobile sidebar. |

**Sprint 5 Total: 29 points**

---

## Sprint 6 — Safety, Compliance & Launch
**Goal:** Adversarial testing, privacy/consent, performance, production deployment.
**Deliverable:** Safe, compliant, performant, live at vhealth.ai. Ready for first patients.

| # | Task | Points | Notes |
|---|------|--------|-------|
| 6.1 | Adversarial AI test suite: 50+ automated tests (prompt injection, medical advice, emergency, language switching) | 5 | CI step. Zero-tolerance: 0 safety violations to pass. |
| 6.2 | Privacy policy page (`/privacy`) + consent flow integration with onboarding | 3 | Legal template adapted for health data. EN + CN. |
| 6.3 | Emergency escalation: pain 8+, crisis keywords → emergency numbers + admin email alert | 3 | Test with real scenarios. |
| 6.4 | Error handling: `error.tsx`, `not-found.tsx`; Claude failure retry (3x); Twilio failure handling | 3 | Web: friendly error. SMS: queued retry. |
| 6.5 | Security audit: auth guards on all `/api/` routes, Twilio sig verification, rate limiting, input sanitization | 3 | Walk every route. Document. |
| 6.6 | Performance: DB indexes on hot queries (messages, metrics by patient+date), `EXPLAIN ANALYZE` top 5 | 2 | Verify RLS doesn't kill perf. |
| 6.7 | CASL/SMS compliance: verify opt-in, STOP handling, frequency limits, consent records | 2 | Twilio compliance docs. Test STOP/START. |
| 6.8 | Production setup: vhealth.ai domain, production Supabase, production Twilio number, env vars | 2 | DNS + Vercel production deploy. |
| 6.9 | Clean production DB: remove test data, create admin account, document setup | 1 | Migration script. |
| 6.10 | E2E smoke test: full journey (signup → onboard → web chat → SMS chat → weekly report → admin dashboard) | 3 | Manual with real phone. Document as launch checklist. |
| 6.11 | Monitoring: Vercel Analytics, Sentry alerts (5xx), SMS cost alert ($40 threshold) | 2 | Alert config. |
| 6.12 | Launch docs: internal runbook (add patients, monitor, handle incidents, front desk workflow) | 2 | For clinic staff. Printed card / QR code design for front desk. |

**Sprint 6 Total: 31 points**

---

## Summary

| Sprint | Theme | Points | End Deliverable |
|--------|-------|--------|-----------------|
| 1 | Foundation & Schema | 31 | Auth working. Empty shells deployed. CI green. |
| 2 | AI Engine & Web Chat | 31 | Patient chats with AI on web. Guardrails enforced. Bilingual. |
| 3 | SMS & Metric Extraction | 32 | Full SMS loop. Metrics extracted. MMS images. Unified history. |
| 4 | Reports & Active Features | 29 | Weekly reports. Nudges. Pattern detection. Cost tracking. |
| 5 | Clinic Dashboard | 29 | Patient list, detail, charts, alerts, patient management. |
| 6 | Safety & Launch | 31 | Adversarial tests. Compliance. Production live. |
| **Total** | | **183 points** | **V1 shipped** |

---

## V2 Confirmed Out of Scope

- White-label infrastructure (dynamic branding, custom domains, multi-tenant routing)
- Multi-clinic management
- Practitioner individual accounts + RBAC
- Appointment booking (Jane App integration)
- Exercise library / video content
- WhatsApp / Telegram / WeChat
- Per-patient custom reminder schedules
- Advanced analytics (cohort analysis, clinic-wide trends)
- Native mobile app
- Data export
- LLM provider abstraction (multi-provider support)
- E-commerce / product recommendations
- Community features
