# Chatbot Widget V1 — Progress Ledger

> **Resume instruction for future Claude sessions:** When the user says "check in progress", read this file FIRST before any other action. It is the single source of truth for where the chatbot widget build stands.

**Last updated:** 2026-04-19
**Branch:** `feat/chatbot-widget-v1` (pushed to origin)
**Demo target:** V-Health Rehab Clinic owner meeting, **April 30, 2026**
**Pilot customer:** V-Health Rehab Clinic, Calgary (JaneApp: `https://vhealthc.janeapp.com`)

---

## 1. Canonical docs (read in this order)

1. `docs/superpowers/specs/2026-04-19-chatbot-widget-design.md` — V1 design spec (what + why)
2. `docs/superpowers/plans/2026-04-19-chatbot-widget-v1.md` — 10-phase implementation plan
3. **This file** — current state, user manual steps, what's next

Supporting:
- `docs/v0-demo-plan.md` — original V0 multi-module plan (chatbot + review booster + dashboard); we built the **chatbot module** only for V1
- `docs/s5-tickets.md`, `docs/s6-tickets.md` etc. — prior sprint work on the patient-facing product (not widget)

---

## 2. What's built (V1 — merged on feat/chatbot-widget-v1)

**26 commits, 42 files changed, ~2,132 insertions.** All phases of the implementation plan executed via subagent-driven development.

| Phase | What shipped | Commits |
|---|---|---|
| 1 | Schema (6 tables + RLS + FK indexes + `updated_at` triggers) + V-Health seed (12 real JaneApp therapists) + env docs | `ec1eb31`, `5778540`, `f335de7`, `8b23ac5` |
| 2 | Security primitives — constants, kill switch, origin allowlist, IP rate limiter (10/min, 30/hr, 50/day), Turnstile server verify | `07d6179`, `10ded97`, `787e36e`, `f9ca6eb`, `dc7831a` |
| 3 | Session state + 3-strike off-topic lock module | `a1b4bb2` |
| 4 | Knowledge base loader + system prompt builder (JSON envelope contract, language mirroring, pricing/emergency guardrails) | `8d94afb`, `900b858` |
| 5 | 4 backend surfaces: `/api/widget/session`, `/api/widget/chat` (Claude Haiku 4.5 via AI SDK v6 `generateText` + `Output.object()`), `/api/widget/lead` (CASL consent + Resend email), `widget_usage_increment` RPC | `4b44977`, `1a0da7f`, `807fab6`, `c1d961f` |
| 6 | UI — iframe-safe layout, server page loading KB, chat panel + suggested chips + handoff buttons + CASL lead form | `0efd8f4`, `36e1103`, `d26d935` |
| 7 | `public/widget.js` embed loader + middleware exemption for `/widget/**` and `/api/widget/**` | `9d8d236`, `8e51f67` |
| 8 | Dashboard at `/dashboard/widget` — labeled "Simulated" banner + 4 KPI cards + Recharts (therapist distribution bar chart, 30-day line chart) | `450a886`, `854c684` |
| 9 | Daily spend-alert cron at 13 UTC via Resend (alerts when daily Anthropic spend > `$WIDGET_DAILY_SPEND_ALERT_USD`) | `16341e0` |
| 10 | 50-case adversarial test suite (40 prompt-construction + 10 live-Claude gated by `RUN_ADVERSARIAL=1`) | `d8ed3f3` |
| Review | 5 blocking fixes from final review: JWT session tokens, conversation counter RPC, stranded-message fix, lead-form signal | `a832a68` |

## 3. Key architecture decisions (locked)

- **Model:** Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) via direct `@ai-sdk/anthropic` provider — **NOT** AI Gateway. Reason: user wanted a **$10 lifetime spend cap** set at the Anthropic console on a dedicated key.
- **Iframe-embedded widget** on V-Health's Wix site via `<script src="…/widget.js">` (not a direct embed).
- **Single-tenant UI, multi-tenant-capable schema** — V1 only serves V-Health, but the data model supports adding clinics later with no migration.
- **JWT session tokens** (HS256, 2h expiry, `jose`) bind chat + lead requests to a specific conversation + clinic + IP-hash. Session route is the only one that verifies Turnstile; downstream routes verify the token instead.
- **3-strike off-topic lock** — Claude returns `{reply, on_topic, show_lead_form}` envelope; when `on_topic=false`, server increments strikes; at 3 → session locked.
- **Google Review Booster module** from the V0 plan is **NOT** part of V1 — deferred to V2.
- **SMS post-visit review follow-up** — also deferred to V2 (CASL complexity).

## 4. Tests (all passing)

- `apps/web/lib/widget/__tests__/` — 29 unit tests across 6 files (kill-switch, origin, rate-limit, turnstile, session, system-prompt, session-token)
- `apps/web/__tests__/widget-adversarial.test.ts` — 40 always-on prompt-construction checks + 10 live-Claude cases gated by `RUN_ADVERSARIAL=1`

Run all widget tests: `pnpm exec vitest run apps/web/lib/widget/__tests__/ apps/web/__tests__/widget-adversarial.test.ts`

## 5. 🟡 MANUAL STEPS Jason must do before the demo

Numbered in priority order. **Top 3 are blockers for the April 30 demo.**

### 🔴 BLOCKER — must do first

1. **Apply migrations to Supabase** — `012_widget_schema.sql`, `013_widget_vhealth_seed.sql`, `014_widget_usage_rpc.sql`, `015_widget_conversation_count_rpc.sql`
   - Option A: Supabase dashboard SQL editor, paste each in order
   - Option B: `supabase db push` if the project is CLI-linked

2. **Regenerate Supabase types** — `pnpm gen:types`
   - This clears ~51 TypeScript errors across `apps/web/app/api/widget/**` and dashboard route. Expected — the types file doesn't know about the new tables yet.

3. **Set Vercel environment variables** (production + preview):
   - `ANTHROPIC_API_KEY_WIDGET` — create a **dedicated Anthropic API key** named `widget-v1`, then go to the Anthropic console and set a **$10 lifetime spend cap** on that key. Put the key value here.
   - `TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` — create a Cloudflare Turnstile site (Invisible mode, domains: `vhealth.ca`, `www.vhealth.ca`, `localhost`). Put both keys here.
   - `WIDGET_SESSION_SECRET` — generate with `openssl rand -hex 32`. Keep secret. Do NOT commit.
   - `WIDGET_ENABLED=true`
   - `WIDGET_CLINIC_EMAIL=vhealthc@gmail.com`
   - `WIDGET_DAILY_SPEND_ALERT_USD=2`

### 🟠 IMPORTANT — do before going live

4. **Swap Resend sender** from sandbox `onboarding@resend.dev` to a verified domain (Gmail throttles/blocks the sandbox sender). Files: `apps/web/lib/email/send-lead-notification.ts`, `apps/web/app/api/cron/widget-usage-alert/route.ts`.

5. **Wix embed test** (target: by April 25, latest April 27)
   - Sign up for a free Wix dev site, paste the script tag: `<script src="https://YOUR-VERCEL-DOMAIN.vercel.app/widget.js" data-clinic-id="vhealth" data-host="https://YOUR-VERCEL-DOMAIN.vercel.app" async></script>`
   - Verify: iframe renders, bubble opens, chat sends, booking link deep-links to JaneApp. Check devtools console for CSP errors.
   - **If Wix blocks the iframe:** use Wix's native "Embed HTML" widget which runs it in their own sandbox.

6. **Live Claude adversarial pass** — before demo day, run:
   `RUN_ADVERSARIAL=1 pnpm exec vitest run apps/web/__tests__/widget-adversarial.test.ts`
   Verify all 10 gated cases pass: envelope shape, on_topic classification, pricing refusal, Chinese mirroring, prompt-injection resistance, emergency redirect.

### 🟢 NICE-TO-HAVE — post-pilot hardening (V1.1 or V2)

From the final code review — non-blocking for April 30 but worth a hardening pass before going wide:

- **Strengthen `visitor_ip_hash`** — currently a weak 32-bit hash. Switch to `crypto.createHash('sha256').update(ip + salt).digest('hex')` with `WIDGET_IP_HASH_SALT` env.
- **Document Upstash as required in prod** in `.env.example` — the in-memory rate limit fallback doesn't share state across Vercel serverless instances.
- **Server-side `consent_text` allowlist** — client currently sends the consent string; server should validate against a pinned list to prevent tampering.
- **Rename `[clinicId]` → `[clinicSlug]`** — the param is the slug, not a UUID.
- **Turnstile render timeout** — `setInterval` in chat-panel.tsx has no max-attempt cap; add one + error surface.
- **Return 502/504 on Claude timeout** — currently returns 200 which prevents client retry logic.
- **Per-route CSP `frame-ancestors`** — hardcoded to `vhealth.ca` in `next.config.ts`; when the first second clinic lands, this needs to be per-`clinicId`.

## 6. What's next — V2 backlog (locked from design spec)

30–60 days post-pilot:

- Human handoff inbox (native chat or Tidio/Crisp SDK)
- Post-visit SMS review follow-up (requires CASL consent at booking)
- Daily email digest to clinic owner (matches SiteGPT)
- Nightly website crawl / auto-retrain
- Qualification routing (insurance type, injury type, urgency)
- Lead-to-booking attribution via JaneApp webhook or manual confirm
- HubSpot/Zapier webhook push
- **Google Review Booster module** (postponed from V0; separate module)
- Multi-clinic onboarding UI
- Whitelabel branding
- A/B test greeting variants

**V3+ tracked but not built:** vector DB/RAG, voice/telephony, WhatsApp/Instagram, SOC 2 / HIPAA, EMR integrations, mobile SDK, agency reseller portal, two-way SMS, per-therapist analytics.

## 7. Business context (from CEO + PM reviews)

- **Pricing:** $199 paid 30-day pilot → $299/mo bundle (chatbot + reviews). Pilot $199 applied as credit to first month.
- **Positioning:** "The only chatbot built specifically for Canadian rehab clinics, installed and running in 5 days, with Google review integration included." Do NOT fight SiteGPT on features.
- **Demo closer moment:** live demo on V-Health's actual site. Type "I hurt my shoulder playing hockey, who should I see?" → bot recommends a specific therapist by name with a booking link. That's the close.
- **At the meeting:** bring a printed one-page pilot agreement + payment link on phone. If you leave without a signature, most likely cause is you didn't ask directly enough.
- **Do NOT verbally commit to V2/V3 features** at the meeting. "That's on my radar. Let's get 30 days of data first and we'll know exactly what to build next."

## 8. Quick resume map (for the next session)

When Jason says "check in progress" next time:

1. Read **this file** first (`docs/widget-v1-progress.md`)
2. Check `git status` and `git log --oneline main..HEAD` to see if anything's changed since last update
3. Check whether the 3 🔴 BLOCKER items are done:
   - Migrations applied? (`supabase db diff` or query `information_schema.tables WHERE table_name LIKE 'widget_%'`)
   - Types regenerated? (typecheck count — 51 pre-existing widget errors = not done; 0 = done)
   - Env vars set? (can only verify from Vercel dashboard; ask Jason)
4. Continue from the highest-priority incomplete item

Default next step if everything is still pending: **walk Jason through the 3 🔴 blockers in order.**

---

*Generated by Claude via `subagent-driven-development` on 2026-04-19.*
