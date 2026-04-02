# PhysioOS

AI-powered recovery coaching platform — connecting patients and practitioners through daily conversational check-ins, quantified progress tracking, and data-driven insights.

**First deployment:** [vhealth.ai](https://vhealth.ai) — V-Health Rehab Clinic (Vancouver, BC)

---

## What It Does

**For patients:** Text your recovery coach via SMS or web chat. Log how you feel in 30 seconds. See your progress over time. Get nudges when you forget. Get insights you'd never notice yourself.

**For practitioners:** See real patient data before appointments. Know who's falling off. Spend less time asking "how have you been?" and more time treating.

**For clinics:** Offer AI recovery coaching under your brand. Increase patient retention and rebooking. Stand out from competitors.

---

## Docs

### Planning
| Document | Description |
|----------|-------------|
| [Market Research](docs/market-research.md) | Competitive landscape, positioning, gaps |
| [Product Scope & Roadmap](docs/product-scope.md) | V1/V2/V3 features, success metrics |
| [User Personas](docs/user-personas.md) | Target users, stories, anti-personas |
| [Marketing Plan V1](docs/marketing-plan-v1.md) | V-Health pilot strategy, clinic outreach |

### Reviews
| Document | Description |
|----------|-------------|
| [CEO Review](docs/ceo-review.md) | OKRs, roadmap dates, risks, sign-off conditions |
| [PM Review](docs/pm-review.md) | MoSCoW prioritization, user stories, acceptance criteria |
| [Tech Lead Review](docs/tech-lead-review.md) | Architecture decisions, technical risks |

### Technical
| Document | Description |
|----------|-------------|
| [Tech Architecture](docs/tech-architecture.md) | Stack, DB schema, AI architecture, SMS flow |
| [UI Guide](docs/ui-guide.md) | Design system, colors, typography, components |
| [Sprint Plan](docs/sprint-plan.md) | 6 sprints, 180 points, task breakdown |

---

## Roadmap

### Key Milestones

| Milestone | Target Date | Gate |
|-----------|-------------|------|
| Legal ready + pilot agreement | Apr 15 | Lawyer sign-off |
| Internal alpha (founder testing) | Apr 30 | Full SMS + web loop |
| Beta at V-Health (5 patients) | May 15 | First patient message |
| Full rollout (20 patients) | Jun 15 | 20 enrolled |
| **Validation gate** | **Jun 30** | **40%+ weekly logging rate** |
| V-Health billing starts | Jul 1 | $199/mo + $5/patient |
| Case study published | Aug 15 | Anonymized data |
| 2 additional clinics signed | Sep 30 | Paid agreements |

### V1 Sprint Progress

| Sprint | Theme | Status |
|--------|-------|--------|
| S1 | Foundation & Schema (31 pts) | [ ] Not started |
| S2 | AI Engine & Web Chat (30 pts) | [ ] Not started |
| S3 | SMS & Metric Extraction (30 pts) | [ ] Not started |
| S4 | Reports & Active Features (29 pts) | [ ] Not started |
| S5 | Clinic Dashboard (29 pts) | [ ] Not started |
| S6 | Safety & Launch (31 pts) | [ ] Not started |

### V2 — "The Platform" (after 3 paying clinics)
- Appointment booking (Jane App integration)
- Exercise library with curated videos
- Multi-clinic support + white-label infrastructure
- Practitioner individual accounts
- WhatsApp + Telegram integration

### V3 — "The Ecosystem"
- Consumer app (sign up without clinic)
- Practitioner marketplace
- Community forums
- E-commerce
- Gym trainer / nutrition expansion

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Monorepo | Turborepo + pnpm |
| Frontend | Next.js (App Router) + shadcn/ui + Tailwind |
| Database | Supabase (PostgreSQL, Auth, Storage, RLS) |
| AI | Claude (Anthropic) via Vercel AI SDK |
| SMS | Twilio (SMS + MMS) |
| Hosting | Vercel |
| Monitoring | Sentry + Vercel Analytics |

---

## Project Structure

```
physio-os/
├── apps/
│   └── web/              # Next.js (patient chat + clinic dashboard)
├── packages/
│   ├── ai-core/          # AI engine, prompts, guardrails, safety
│   └── shared/           # Supabase types, domain types, metrics
├── supabase/             # Migrations, RLS policies, seed data
└── docs/                 # Planning, reviews, sprints
```

---

## License

Proprietary. All rights reserved.
