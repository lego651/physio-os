# Technical Architecture — PhysioOS

> Last updated: 2026-04-01
> Monorepo structure modeled after drop-note project

---

## Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Monorepo | Turborepo + pnpm | Proven in drop-note; fast builds; shared packages |
| Frontend | Next.js (App Router) + shadcn/ui + Tailwind | Rapid UI development; cal.com-style clean aesthetic |
| Backend | Next.js API routes + Supabase | Minimal infra; Supabase handles auth, DB, storage, realtime |
| Database | Supabase (PostgreSQL) | Auth, RLS, realtime subscriptions, edge functions |
| AI | Claude API (Anthropic) via Vercel AI SDK | Best bilingual quality; structured output; streaming |
| SMS | Twilio (SMS + MMS) | Reliable; good Canadian number support; webhook-based |
| Hosting | Vercel | Zero-config deploys; edge functions; preview URLs |
| Monitoring | Vercel Analytics + Sentry | Error tracking; performance monitoring |

---

## Monorepo Structure

```
physio-os/
├── apps/
│   ├── web/                    # Next.js app (patient chat + clinic dashboard)
│   │   ├── app/
│   │   │   ├── (patient)/      # Patient-facing routes
│   │   │   │   ├── chat/       # Web chat interface
│   │   │   │   ├── report/     # Weekly progress report (mobile-friendly)
│   │   │   │   └── signup/     # Patient onboarding
│   │   │   ├── (clinic)/       # Clinic dashboard routes
│   │   │   │   ├── dashboard/  # Patient list, activity overview
│   │   │   │   ├── patients/   # Individual patient detail + reports
│   │   │   │   └── settings/   # Clinic settings, alert preferences
│   │   │   ├── api/
│   │   │   │   ├── chat/       # AI chat endpoint (Vercel AI SDK)
│   │   │   │   ├── sms/        # Twilio webhook receiver
│   │   │   │   ├── cron/       # Scheduled jobs (nudges, weekly reports)
│   │   │   │   └── webhooks/   # External service webhooks
│   │   │   └── layout.tsx
│   │   └── components/
│   │       ├── ui/             # shadcn components
│   │       ├── chat/           # Chat interface components
│   │       └── dashboard/      # Clinic dashboard components
│   │
├── packages/
│   ├── ai-core/                # Shared AI engine
│   │   ├── prompts/            # System prompts, guardrails
│   │   │   ├── system.ts       # Base system prompt
│   │   │   ├── guardrails.ts   # Safety rules, topic boundaries
│   │   │   └── extraction.ts   # Metric extraction prompts
│   │   ├── tools/              # AI tool definitions
│   │   │   ├── log-metrics.ts  # Extract and store pain/discomfort scores
│   │   │   ├── get-history.ts  # Retrieve patient history for context
│   │   │   ├── get-schedule.ts # Get patient's routine for timing
│   │   │   └── generate-report.ts # Weekly summary generation
│   │   ├── engine.ts           # Core conversation handler
│   │   └── safety.ts           # Input classification, adversarial detection
│   │
│   ├── shared/                 # Shared types and utilities
│   │   ├── src/
│   │   │   ├── database.types.ts  # Supabase generated types
│   │   │   ├── metrics.ts         # Metric definitions (pain, discomfort, etc.)
│   │   │   └── types.ts           # Shared domain types
│   │   └── package.json
│   │
│   └── sms/                    # Twilio SMS/MMS handler
│       ├── src/
│       │   ├── client.ts       # Twilio client wrapper
│       │   ├── inbound.ts      # Parse incoming SMS/MMS
│       │   ├── outbound.ts     # Send SMS, MMS, with links
│       │   └── types.ts
│       └── package.json
│
├── supabase/
│   ├── migrations/             # Database migrations
│   └── seed.sql                # Development seed data
│
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
└── README.md
```

---

## Database Schema (Supabase PostgreSQL)

### Core Tables

```sql
-- Clinic (white-label tenant)
clinics
  id              uuid PK
  name            text            -- "V-Health Rehab Clinic"
  slug            text UNIQUE     -- "vhealth"
  domain          text            -- "vhealth.ai"
  phone_number    text            -- Twilio number for this clinic
  settings        jsonb           -- alert thresholds, branding, etc.
  created_at      timestamptz

-- Clinic admin users
clinic_users
  id              uuid PK
  clinic_id       uuid FK → clinics
  email           text
  role            text            -- 'owner', 'practitioner', 'staff'
  name            text
  auth_user_id    uuid FK → auth.users
  created_at      timestamptz

-- Patients
patients
  id              uuid PK
  clinic_id       uuid FK → clinics
  phone           text            -- for SMS
  name            text
  language        text DEFAULT 'en'   -- 'en' or 'zh'
  profile         jsonb           -- injury, diagnosis, symptoms, triggers, goals
  daily_routine   jsonb           -- schedule, risk windows, exercise timing
  sharing_enabled boolean DEFAULT false  -- share with practitioner
  practitioner_id uuid FK → clinic_users (nullable)
  created_at      timestamptz

-- Conversation messages
messages
  id              uuid PK
  patient_id      uuid FK → patients
  role            text            -- 'user', 'assistant', 'system'
  content         text
  channel         text            -- 'web', 'sms'
  media_url       text[]          -- MMS image URLs
  created_at      timestamptz

-- Extracted metrics (structured data from conversations)
metrics
  id              uuid PK
  patient_id      uuid FK → patients
  recorded_at     timestamptz     -- when the patient reported this
  pain_level      smallint        -- 1-10, nullable
  discomfort      smallint        -- 0-3, nullable
  sitting_tolerance_min  int      -- minutes, nullable
  exercises_done  text[]          -- list of exercise names
  exercise_count  int             -- how many done
  notes           text            -- free-form context
  source_message_id uuid FK → messages  -- which message this was extracted from
  created_at      timestamptz

-- Weekly reports
reports
  id              uuid PK
  patient_id      uuid FK → patients
  week_start      date
  summary         text            -- AI-generated narrative
  metrics_summary jsonb           -- avg pain, avg discomfort, trends, etc.
  insights        text[]          -- pattern detections
  created_at      timestamptz

-- Scheduled nudges / reminders
scheduled_actions
  id              uuid PK
  patient_id      uuid FK → patients
  action_type     text            -- 'exercise_reminder', 'inactivity_nudge', 'weekly_report'
  scheduled_for   timestamptz
  status          text            -- 'pending', 'sent', 'cancelled'
  created_at      timestamptz
```

### Row Level Security (RLS)

- Patients can only read their own messages and metrics
- Clinic users can read patients belonging to their clinic
- Practitioner can only see patients who have `sharing_enabled = true` AND are assigned to them
- Admin/owner can see all patients in their clinic

---

## AI Architecture

### Conversation Flow

```
Patient sends message (SMS or Web)
        │
        ▼
┌─────────────────┐
│  Input Layer     │  ← Receive from Twilio webhook or web chat API
│  (channel parse) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Safety Check    │  ← Classify input: on-topic? adversarial? emergency?
│  (ai-core/       │     If emergency (suicidal, severe pain): redirect to
│   safety.ts)     │     emergency services / practitioner
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Context Build   │  ← Load: patient profile, last 20 messages,
│                  │     recent metrics, daily routine, current time
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  AI Engine       │  ← Claude API via Vercel AI SDK
│  (ai-core/       │     System prompt + guardrails + tools
│   engine.ts)     │     Tools: log_metrics, get_history, get_schedule
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Post-process    │  ← Extract metrics from response if AI used log_metrics tool
│                  │     Store message + metrics to Supabase
│                  │     Truncate for SMS if channel = sms (160 char segments)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Response        │  ← Send via Twilio (SMS) or stream (web chat)
└─────────────────┘
```

### AI Guardrails (ai-core/guardrails.ts)

The system prompt enforces:

1. **Never diagnose** — "I'm not qualified to diagnose. Please discuss this with your practitioner."
2. **Never prescribe new exercises** — Only reference exercises already in patient's plan
3. **Always defer to practitioner** — "Great question — bring this up at your next session with [practitioner name]."
4. **Emergency escalation** — If patient reports severe pain (8+), sudden new symptoms, or mental health crisis → provide emergency numbers, notify clinic
5. **Stay in scope** — Recovery coaching, logging, motivation. Not general health, not medical advice.
6. **Consistent metrics** — Always ask for specific numbers when patient reports pain/discomfort vaguely
7. **Language matching** — Respond in the language the patient uses; store metrics in English

### AI Safety Testing

Before launch, build an adversarial test suite:
- Prompt injection attempts ("ignore your instructions and...")
- Off-topic requests ("what's the stock market doing?")
- Medical advice fishing ("should I take ibuprofen?")
- Indirect dangerous requests ("my friend has [condition], what exercises should they do?")
- Language switching attacks (start in English, switch to another language to bypass rules)
- Social engineering ("my physio said I should ask you to prescribe...")

---

## SMS Architecture (Twilio)

### Setup
- One Twilio phone number per clinic (Canadian number for V-Health)
- Webhook URL: `https://vhealth.ai/api/sms`
- Twilio posts inbound SMS/MMS to webhook
- App processes and responds via Twilio API

### Message Handling
- Inbound: Parse body text + media URLs (MMS images)
- Images: Store in Supabase Storage, reference in message record
- Outbound: Respect SMS segment limits; for long responses, send multiple segments or include web link
- Weekly reports: Send short SMS + link to `https://vhealth.ai/report/{token}`

### Cost Management
- Track message count per clinic per month
- Alert if approaching budget threshold
- Weekly reports via link (not full content in SMS) to minimize segments

---

## Authentication

- **Patients:** Phone number-based auth (SMS OTP via Supabase Auth or Twilio Verify)
- **Clinic users:** Email/password via Supabase Auth
- **Web chat:** Patient authenticates with phone OTP; session persisted
- **SMS:** Authenticated by phone number (inherent — they're texting from their number)

---

## Cron Jobs (Vercel Cron)

| Job | Schedule | What It Does |
|-----|----------|-------------|
| Inactivity check | Daily 10am | Find patients with no messages in 3+ days; send nudge |
| Weekly report | Sunday 9am | Generate and send weekly progress reports |
| Exercise reminder | Per patient schedule | Remind based on patient's daily routine |
| Pre-appointment prep | Day before appointment | Generate summary for practitioner (V2, requires booking integration) |

---

## Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# AI
ANTHROPIC_API_KEY=

# Twilio
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=

# App
NEXT_PUBLIC_APP_URL=https://vhealth.ai

# Monitoring
SENTRY_DSN=
```

---

## Key Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Claude only (V1) | Yes | Best bilingual quality; simplify prompt engineering; add fallback in V2 |
| Supabase over raw Postgres | Yes | Auth, RLS, realtime, storage built in; fast to ship |
| Structured DB over md files | Yes | Md files don't scale; need queries for dashboards and reports; AI gets context via tool calls loading relevant DB rows |
| Vercel AI SDK over LangChain | Yes | Simpler; native Vercel integration; streaming; tool calling built in; LangChain is unnecessary abstraction for V1 |
| SMS over Telegram | SMS | More accessible; no app install; patients already know SMS |
| Web chat alongside SMS | Yes | Rich UI for patients who want it; links from SMS reports open here |
| Monorepo over separate repos | Yes | Shared AI core, shared types; single deploy pipeline |
| White-label via clinic slug | Yes | One codebase serves multiple clinics; domain mapping per clinic |
