# S2 Review Engine — Backlog & Improvements

> Last updated: 2026-05-16
> Spec: [docs/superpowers/specs/2026-05-16-s2-review-engine-design.md](superpowers/specs/2026-05-16-s2-review-engine-design.md)
> Plan: [docs/superpowers/plans/2026-05-16-s2-review-engine.md](superpowers/plans/2026-05-16-s2-review-engine.md)
> Runbook: [docs/operations/s2-review-engine.md](operations/s2-review-engine.md)
> Roadmap: [docs/roadmap.md](roadmap.md)

---

## Current state (2026-05-16)

- ✅ PR #38 merged to main (commit `380ae2c`)
- ✅ Migrations 016 + 017 applied to Supabase
- ✅ Vercel cleanup: deleted duplicate `physio-os` project, kept `physio-os-web`, migrated 9 env vars, transferred `physio-os-pi.vercel.app` alias
- ✅ 11 env vars set (REVIEW_*, RESEND_*, TWILIO_*, ANTHROPIC_*, SUPABASE_*, ADMIN_EMAIL)
- ✅ Admin user `legogao651@gmail.com` / `123456` works
- ✅ Sidebar nav: Review Requests link added
- ✅ Stage 0 functional flow verified end-to-end:
  - Send form → email arrives → click → landing page → AI draft → copy → maps redirect
  - SMS arrives → click → landing page → AI draft (after UUID-short-link fix)
  - Funnel events `sent_email`, `email_delivered`, `link_clicked`, `keywords_submitted`, `draft_generated`, `copy_clicked`, `maps_redirected`, `sent_sms` all firing
- ⚠️ Twilio account is on **trial** (verified caller ID for `+12368682134` only)
- ⚠️ Google Place ID still `NULL` (falls back to V-Health Google Maps listing page)
- ⚠️ Resend sender is `onboarding@resend.dev` (no custom domain → no opened-pixel tracking)

---

## 🔴 Phase 1.0 — Finish Stage 0 (5-10 min, do next)

| # | Item | Action |
|---|------|--------|
| 1.1 | Test unsubscribe flow | Open the email → click "Unsubscribe" link at the bottom → confirm "You're unsubscribed" page renders |
| 1.2 | Test opt-out rejection | After 1.1, re-send `channel=email` from admin form → verify funnel shows `send_failed` with `metadata.reason='opted_out'` |
| 1.3 | Set real V-Health Google Place ID | Find ChIJ-prefixed ID at [Place ID Finder](https://developers.google.com/maps/documentation/javascript/examples/places-placeid-finder) → `UPDATE clinics SET google_place_id = 'ChIJ...' WHERE slug = 'vhealth';` |

---

## 🟡 Stage 2 — Real-world launch prerequisites

Must do before sending review requests to actual V-Health patients.

| # | Item | Why | Estimate |
|---|------|-----|----------|
| 2.1 | Resend custom domain (e.g. `vhealth.ca`) | `onboarding@resend.dev` looks spammy; enables sender reputation; **required for `email_opened` pixel tracking** | 30 min + DNS propagation |
| 2.2 | Twilio paid upgrade ($20 min top-up) | Trial prefix "Sent from your Twilio trial account -" eats 38 chars; trial limits verified caller IDs only; can't send to unverified real patients | 5 min |
| 2.3 | Twilio Canadian 10DLC registration | When SMS volume grows, carriers may rate-limit unregistered sender. Trial-scale OK without; production-scale needs brand + campaign registration | 1-5 business days review |
| 2.4 | David Wang written CASL consent | Legal requirement before any real patient outreach. WhatsApp screenshot acceptable; keep in `docs/operations/` | 1 day (David's reply time) |
| 2.5 | Flip `REVIEW_TEST_MODE=false` on Vercel | Currently overrides every recipient to Jason's email/phone. Production must send to real patient values from admin form | 1 min |
| 2.6 | Real `REVIEW_BASE_URL` if/when custom domain | Currently `https://physio-os-pi.vercel.app`. Once V-Health has a branded URL, switch | 5 min |
| 2.7 | Twilio number Emergency Address registration | Avoid $75 charge if anyone calls 911 from the number. Free, one-time. | 5 min |

---

## 🟢 Phase 2+ — Product improvements

Iterate after Stage 1 friend alpha + early Stage 2 data.

### UX / patient-facing
| # | Item | Value | Priority |
|---|------|-------|----------|
| 3.1 | Patient confirmation page after Open Maps | Currently no "thanks" feedback; patient might be lost | M |
| 3.2 | Multi-language UI + AI draft (中文) | V-Health has many Chinese patients; English-only is friction | H |
| 3.3 | Mobile UX polish on landing page | Inputs sized for thumb; verify keyboard behavior on iOS Safari | M |
| 3.4 | "Don't show me reviews" lower-friction opt-out on landing page | One-tap from review page; currently only from email footer | L |

### AI quality
| # | Item | Value | Priority |
|---|------|-------|----------|
| 3.5 | AI prompt tuning with few-shot examples | Current drafts feel generic; few-shot would lift conversion | H |
| 3.6 | Variant B (conversational pull) — A/B vs A | spec'd in `docs/s2-design-preview.html`; needs traffic split | M |
| 3.7 | Variant D (refine my own) — A/B vs A | spec'd; matches user style better | M |
| 3.8 | Variant F (photo-first multimodal) | requires Resend domain + image upload; defer | L |
| 3.9 | Guardrails on AI output (filter spammy / hallucinated content) | one bad review can damage Google ranking | H |

### Ops / scale
| # | Item | Value | Priority |
|---|------|-------|----------|
| 3.10 | Admin table auto-refresh (polling or Supabase realtime) | currently F5 to see new events | M |
| 3.11 | Bulk send: CSV upload of patient list | manual one-at-a-time doesn't scale | H |
| 3.12 | JaneApp webhook → auto-send on appointment-completed | true automation; removes admin manual step | H |
| 3.13 | Reminder cron for unclicked recipients (3-day nudge) | many won't click first email; one reminder doubles conversion | M |
| 3.14 | Retry adapter for transient Resend/Twilio failures | currently single attempt; ~2% transient failure rate ignored | M |
| 3.15 | Rate limiter per clinic per day | prevent runaway sends from operator error | M |

### Monitoring / hygiene
| # | Item | Value | Priority |
|---|------|-------|----------|
| 3.16 | Sentry alert rules for send_failed spike | already integrated, no alerts configured | H |
| 3.17 | Funnel dashboard (conversion rates over time) | admin table shows per-request; need aggregate trends | M |
| 3.18 | Fix CI Prettier (170 files) | run `pnpm format` once, commit | L |
| 3.19 | Document the `feat/chatbot-widget-v1` branch fate | parked indefinitely (D04 data gate) — decide merge or close | L |
| 3.20 | Production smoke checklist as cron job | weekly self-test: send a review request to a known test inbox, alert if any step breaks | L |

### Cross-clinic productization (the $1M ARR North Star)
| # | Item | Value | Priority |
|---|------|-------|----------|
| 3.21 | Self-serve clinic onboarding (POST `/api/admin/clinics`) | currently INSERT-via-SQL; needs UI for clinic #2+ | H |
| 3.22 | Per-clinic branding (logo, colors in email) | core productization | H |
| 3.23 | Per-clinic billing meter (count sends, charge $99/mo) | revenue mechanic | H |
| 3.24 | Per-clinic admin user (auth scoping) | currently single global ADMIN_EMAIL | H |

---

## Known issues / open questions

| # | Issue | Notes |
|---|-------|-------|
| Q1 | SMS uses raw UUID in URL — security implication? | UUIDs have 122 bits entropy, non-guessable. JWT verification removed from SMS-link path (landing page mints fresh JWT). Acceptable for Phase 1; revisit if reviews are sensitive enough to need signed links. |
| Q2 | `physio-os-pi.vercel.app` is `physio-os-web` deploy-specific alias | If a new deploy fails, manually `vercel alias set` to last good. Or accept that prod's URL is `physio-os-web.vercel.app` and drop the `-pi` short. |
| Q3 | Migration 016 has CREATE IF NOT EXISTS for `clinics` | Safe with widget V1 merge; not safe if widget V1 changes the schema. Audit before merging widget V1. |
| Q4 | No tests on the SMS adapter sending path (only unit) | Manual smoke is current verification. Add integration test once Twilio paid (use Magic numbers for cost-free testing). |

---

## Related docs

- [docs/motivation.md](motivation.md) — why we're doing this
- [docs/pain-points.md](pain-points.md) — V-Health needs analysis
- [docs/roadmap.md](roadmap.md) — Phase 1 lock, S1/S3-S7 backlog
- [docs/operations/s2-review-engine.md](operations/s2-review-engine.md) — operator runbook
- [docs/s2-design-preview.html](s2-design-preview.html) — 6 AI variant designs explored
- [docs/s2-launch-todo.html](s2-launch-todo.html) — original launch TODO (mostly checked off)
- [docs/s2-test-workflow.html](s2-test-workflow.html) — Stage 0 test walkthrough
