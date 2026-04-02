# PhysioOS V1 — Tech Lead Review

**Date:** 2026-04-01

---

## Architecture Decisions (Locked)

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| D1 | Multi-tenant | Single-tenant V1; `clinic_id` FK in schema for V2 | Removes routing, RLS, and config complexity |
| D2 | Patient web auth | Supabase Auth phone OTP (Twilio as SMS provider) | Single auth system; built-in session management |
| D3 | Admin auth | Supabase Auth email/password; check `ADMIN_EMAIL` env var | Simplest possible. No RBAC for V1. |
| D4 | Weekly report auth | Signed JWT token in URL, 7-day expiry | No login needed; secure enough for summary data |
| D5 | SMS response strategy | System prompt caps at 280 chars; over-limit → truncate + web link | Predictable cost; path to richer content |
| D6 | MMS images | Store in Supabase Storage; pass to Claude vision | User requirement; Claude vision is easy |
| D7 | Conversation context | Token-budget: ~4K tokens history + full patient profile + system prompt | Predictable cost and quality |
| D8 | Twilio local dev | ngrok tunnel for webhook testing | Standard approach |
| D9 | Chart library | Recharts via shadcn/ui charts | In-ecosystem; sufficient for V1 |
| D10 | Timezone | Hard-code America/Vancouver | Single clinic; add per-clinic in V2 |
| D11 | Package structure | `apps/web` + `packages/ai-core` + `packages/shared` (no separate sms package) | Minimal overhead; Twilio logic lives in ai-core or apps/web/lib |
| D12 | Cron strategy | Vercel Cron; single daily/weekly job checks all patients | 20-30 patients don't need a scheduling engine |

---

## Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Claude API latency on SMS (>15s Twilio timeout) | High | Medium | Return 200 immediately; process async; reply via Twilio REST API |
| SMS costs exceed $50/month | Medium | Low | System prompt enforces short replies; weekly reports via web link; monitor via Twilio dashboard |
| Claude generates unsafe advice despite guardrails | Low | Critical | 50+ adversarial tests; log all conversations; human review 10% weekly |
| Supabase phone OTP delivery failures (carrier filtering) | Medium | High | Test with real Canadian numbers early; monitor delivery rates |
| Rapid-fire messages create metric extraction race conditions | Medium | Low | Process sequentially per patient; last-write-wins for same timestamp |
| Twilio webhook replay/duplicate delivery | Medium | Low | Idempotency key on message SID |

---

## Items Cut or Simplified from Original Architecture

| Original | Changed To | Why |
|----------|-----------|-----|
| `clinics` table with slug/domain routing | Single-row config; `clinic_id` FK for V2 migration | Single tenant |
| `clinic_users` with roles | Single admin checked via `ADMIN_EMAIL` env var | No RBAC needed |
| `scheduled_actions` table | Simple cron logic querying patients directly | 20-30 patients don't need a scheduler |
| `packages/sms` separate package | Twilio logic in `apps/web/lib/sms/` | Only one consumer; extract when needed |
| White-label theming config | Hard-coded V-Health branding in env vars | No dynamic branding |
| Multiple LLM providers | Claude only | V1 decision; add abstraction in V2 |
