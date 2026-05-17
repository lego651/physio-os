# PhysioOS

AI productization for Calgary local service businesses. First test bed: **V-Health Rehab Clinic**.

**Live:** [physio-os-web.vercel.app](https://physio-os-web.vercel.app) · [physio-os-pi.vercel.app](https://physio-os-pi.vercel.app)

---

## What's shipping right now

**S2 Review Engine** — post-visit pipeline that sends V-Health patients an email/SMS, opens a one-page web form, has Claude Haiku draft a Google review from 3 keywords, and tracks the full funnel (sent → delivered → opened → clicked → keywords → generated → copied → redirected).

Phase 1 is **multi-tenant from day 1** because the north star is to productize the playbook and sell to clinic #2+. See [docs/motivation.md](docs/motivation.md).

---

## Docs (current, all else archived)

| Doc | Purpose |
|-----|---------|
| [Motivation](docs/motivation.md) | North star — why we're doing this, stop conditions |
| [Pain Points](docs/pain-points.md) | V-Health needs analysis + owner persona |
| [Roadmap](docs/roadmap.md) | Phase 1 lock, S1/S3–S7 deferred backlog |
| [S2 Backlog](docs/s2-backlog.md) | Active TODOs: Phase 1 finish, Stage 2 prereqs, Phase 2+ improvements |
| [S2 Operator Runbook](docs/operations/s2-review-engine.md) | Stage 0 smoke, env vars, rollout stages, troubleshooting |
| [S2 Spec](docs/superpowers/specs/2026-05-16-s2-review-engine-design.md) | Authoritative spec for the review engine |
| [S2 Plan](docs/superpowers/plans/2026-05-16-s2-review-engine.md) | Implementation plan (22 tasks, TDD) |

Pre-pivot Sprint 1–7 artifacts and Widget V1 work live in `docs/archive/2026-05-pre-pivot/`.

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Monorepo | Turborepo + pnpm |
| Frontend | Next.js (App Router) + shadcn/ui + Tailwind |
| Database | Supabase (Postgres, Auth, RLS) |
| AI | Claude Haiku 4.5 via Vercel AI SDK |
| Email | Resend (transactional + webhook for delivered/opened) |
| SMS | Twilio REST |
| Hosting | Vercel (`physio-os-web` project) |
| Observability | Sentry + Vercel Analytics |

---

## Project structure

```
physio-os/
├── apps/web/                         # Next.js — patient site + clinic dashboard + APIs
│   ├── app/
│   │   ├── (clinic)/dashboard/       # Admin UI (Patients, Intake, Review Requests, Settings)
│   │   ├── review/[token]/           # Patient landing page (accepts JWT or UUID)
│   │   └── api/
│   │       ├── admin/review-requests # POST send / GET list
│   │       ├── review-requests/      # generate / track / unsubscribe
│   │       └── webhooks/resend       # email delivered / opened
│   └── lib/review/                   # tokens, engine, adapters, templates
├── packages/
│   ├── ai-core/                      # Recovery Coach AI (legacy, still deployed)
│   └── shared/                       # Supabase types, domain types
├── supabase/migrations/              # 001–017 (016+017 are S2)
└── docs/                             # See table above
```

---

## Local dev

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local   # fill in values (see runbook)
pnpm dev                                        # turbo dev all packages
pnpm vitest run                                 # tests
```

---

## License

Proprietary. All rights reserved.
