# PhysioOS V1 — Product Manager Review

**Date:** 2026-04-01
**Deployment:** vhealth.ai (V-Health Rehab Clinic)

---

## V1 Scope — Final MoSCoW

### Must Have (ship-blocking)

| # | Feature | Sprint | Rationale |
|---|---------|--------|-----------|
| M1 | SMS inbound/outbound (Twilio, Canadian number) | S3 | Core channel. Lowest friction. |
| M2 | AI conversation engine (Claude + Vercel AI SDK) | S2 | Powers all interactions. |
| M3 | Daily metric extraction from natural language | S3 | The product's reason for existing. |
| M4 | Metric storage (pain 1-10, discomfort 0-3, sitting tolerance, exercises) | S3 | Structured data from unstructured input. |
| M5 | Bilingual AI responses (EN/CN) | S2 | Non-negotiable for V-Health demographics. |
| M6 | Patient onboarding (name, condition, language + consent) | S2 | Cold-start + legal requirement. |
| M7 | Admin dashboard — patient list with status | S5 | Practitioner must see value. |
| M8 | Admin dashboard — patient detail with metrics + charts | S5 | Depth view for pre-appointment prep. |
| M9 | Web chat interface with streaming | S2 | Rich channel; destination for SMS links. |
| M10 | AI guardrails (no diagnosis, no prescription, emergency escalation) | S2 | Safety. One bad response kills the pilot. |
| M11 | SMS response length control (max 2 segments) | S3 | Budget + UX constraint. |
| M12 | Consent capture (first interaction, PIPEDA) | S2 | Legal compliance. Non-negotiable. |
| M13 | MMS image support (patient sends photos) | S3 | User requirement. Claude vision handles it. |

### Should Have (ship within 1 week of first patients)

| # | Feature | Sprint | Rationale |
|---|---------|--------|-----------|
| S1 | Weekly progress report (SMS link to web page) | S4 | High retention value. |
| S2 | Inactivity nudge (3+ days no message) | S4 | Critical for retention. |
| S3 | Inactive patient flag on admin dashboard | S5 | Practitioner awareness. |
| S4 | SMS cost tracking (admin visible) | S4 | Budget protection. |
| S5 | AI failure fallback ("didn't understand, try again") | S2 | Robustness. |
| S6 | Pattern detection ("discomfort spikes when you skip stretches") | S4 | High-value active insight. |

### Could Have (V1.5 — based on pilot feedback)

| # | Feature | Rationale |
|---|---------|-----------|
| C1 | Anomaly alerts (pain spike detection → admin notification) | Needs baselines. False positive risk. |
| C2 | Exercise reminders (scheduled per patient routine) | Needs daily routine data. Onboarding friction. |
| C3 | Recovery Q&A (patient asks questions) | Scope creep. Safety surface area. |
| C4 | Clinic settings page (alert thresholds, branding) | Single clinic. Hardcode for V-Health. |
| C5 | "Copy summary to clipboard" for practitioners | Useful for charting in Jane App. |

### Won't Have (V2+)

- Pre-appointment summaries (needs Jane App integration)
- Appointment booking
- Shared reports with consent toggle (single clinic = admin sees all)
- Multi-clinic support / white-label infrastructure
- Practitioner individual accounts / RBAC
- WhatsApp / Telegram / WeChat
- Exercise library / videos
- Community / e-commerce
- Native mobile app

---

## User Stories — Must-Haves

### M1: SMS Chat

**As a** patient, **I want to** text my V-Health number and get a response from my recovery coach, **so that** I can log how I'm feeling without downloading an app.

**Acceptance Criteria:**
- Patient sends SMS to V-Health Twilio number → receives AI response within 15 seconds
- Messages stored with `channel = 'sms'`
- Unknown phone numbers trigger onboarding flow (M6)
- Twilio webhook secured (signature validation)
- Delivery failures logged, not crashed

### M2: AI Conversation Engine

**As a** patient, **I want to** have a natural conversation about my recovery, **so that** logging feels like talking to a friend, not filling out a form.

**Acceptance Criteria:**
- AI responds using patient profile + last ~4K tokens of message history + recent metrics
- System prompt includes clinic name, patient name, condition
- Response latency: <5s for SMS, streaming starts <2s for web
- Claude API error → fallback message (S5)

### M3: Metric Extraction

**As a** patient, **I want to** describe how I feel in my own words and have metrics recorded automatically, **so that** I don't have to remember scales or fill out forms.

**Acceptance Criteria:**
- "my back hurts about a 4" → `pain_level = 4`
- "discomfort is about 2" → `discomfort = 2`
- "sat for 30 minutes before it started" → `sitting_tolerance_min = 30`
- "did my stretches today" → `exercises_done` recorded
- Ambiguous input ("I feel okay") → AI asks clarifying follow-up, doesn't guess
- Metrics linked to source message via `source_message_id`

### M4: Metric Storage

**As a** system, **I need to** store metrics in structured, queryable format for dashboards and reports.

**Acceptance Criteria:**
- All metric fields nullable (patient may report only one per interaction)
- `recorded_at` reflects when patient reported, not system processing time
- Queryable by patient_id + date range
- Idempotent (no duplicate metrics for same message)
- RLS: patients read own only; admin reads all

### M5: Bilingual Support

**As a** Mandarin-speaking patient, **I want to** text in Chinese and get responses in Chinese.

**Acceptance Criteria:**
- Chinese input → Chinese response; English input → English response
- Mixed-language input ("我今天 discomfort 2") → respond in patient's default language
- All extracted metrics stored in English regardless of conversation language
- Admin dashboard displays data in English

### M6: Patient Onboarding

**As a** new patient texting V-Health for the first time, **I want to** be guided through quick setup so the AI knows enough to help me.

**Acceptance Criteria:**
- Unrecognized phone → onboarding flow (not generic response)
- Collects: (1) name, (2) primary condition, (3) language preference
- Consent message sent + acknowledged before health data collection
- "Reply STOP to opt out anytime" included
- After 3-5 messages, transitions to normal coaching + first metric ask
- Works identically on SMS and web
- STOP at any point → cease all outbound (Twilio compliance)

### M7: Admin — Patient List

**As a** V-Health practitioner, **I want to** see all patients and their status at a glance.

**Acceptance Criteria:**
- Login via email/password (Supabase Auth)
- Shows: name, last activity, recent discomfort, recent pain, days logged this week
- Sortable by last activity (default: most recent)
- 5+ days inactive → amber flag
- Pain 2+ above 7-day average → red flag
- Loads <3s with 30 patients
- Responsive (tablet usable, mobile functional)

### M8: Admin — Patient Detail

**As a** practitioner, **I want to** view a patient's full recovery history before their appointment.

**Acceptance Criteria:**
- Profile (name, condition, language)
- Metric history table (date, pain, discomfort, sitting tolerance, exercises)
- Line chart: discomfort over time (Recharts)
- Conversation log (scrollable, most recent first)
- Last 30 days default, option to load more
- Read-only (no edit capability V1)
- Loads <2s

### M9: Web Chat

**As a** patient, **I want to** chat through a web browser for a richer experience than SMS.

**Acceptance Criteria:**
- Available at vhealth.ai/chat
- Phone OTP authentication (Supabase Auth)
- Streaming AI responses (`useChat` hook)
- Inline metric badges when AI extracts data
- History persists across sessions
- Web and SMS share same conversation history
- Mobile-first, WCAG AA, clinic branding in header

### M10: AI Guardrails

**As a** clinic owner, **I need** the AI to never diagnose, prescribe, or give medical advice.

**Acceptance Criteria:**
- Refuses to diagnose → "please discuss with your practitioner"
- Refuses to prescribe new exercises
- Defers medical questions to named practitioner
- Pain 8+ → emergency response + admin notification
- Off-topic → polite redirect
- 50+ adversarial test cases pass with zero breaches
- All guardrail violations logged

### M11: SMS Length Control

**As a** system operator with <$50/month SMS budget, **I need** concise SMS responses.

**Acceptance Criteria:**
- SMS responses capped at 320 characters (2 segments)
- Over-limit → truncate + "...more at vhealth.ai/chat"
- SMS system prompt: "Keep responses under 300 characters. Be warm but brief."
- Weekly reports: short SMS + web link (not inline)
- Monthly segment count tracked

### M12: Consent Capture

**As a** clinic under PIPEDA, **I need** explicit consent before collecting health data.

**Acceptance Criteria:**
- First interaction includes consent language before health data requested
- Consent timestamp recorded in patient record
- STOP → cease outbound; patient marked opted-out
- Privacy policy at vhealth.ai/privacy
- Consent available in English and Chinese
- No health data collection without confirmed consent

### M13: MMS Images

**As a** patient, **I want to** send photos of my exercises or condition via text message.

**Acceptance Criteria:**
- MMS images received via Twilio webhook
- Images stored in Supabase Storage
- Images passed to Claude via vision API for description/context
- Image reference stored in message record
- Admin can see images in conversation log

---

## Feature Dependency Map

```
                    M12 (Consent)
                         │
M1 (SMS) ──────► M6 (Onboarding) ──────► M2 (AI Engine)
M9 (Web) ──────►        │                    │
                         │               M10 (Guardrails)
                         │               M5 (Bilingual)
                         │                    │
                         │               M3 (Extraction)
                         │               M13 (MMS)
                         │                    │
                         │               M4 (Storage)
                         │                    │
                    M11 (SMS Length)     M7 (Patient List)
                                             │
                                        M8 (Patient Detail)
```

**Critical path:** Infrastructure (S1) → AI + Web Chat (S2) → SMS + Metrics (S3) → Reports + Nudges (S4) → Dashboard (S5) → Safety + Launch (S6)

---

## UX Concerns to Address

1. **Cold-start:** AI must be useful from message #1. Minimum viable profile at signup, not gradual discovery.
2. **Scale education:** First 3 interactions explicitly teach the 0-3 discomfort and 1-10 pain scales with legends.
3. **Channel unity:** SMS and web share same history. Test explicitly.
4. **Language switching:** Default to patient's stored preference. Only switch if entire message is in other language.
5. **Practitioner engagement:** Add "send check-in" button on patient detail → sends SMS nudge from clinic number. Gives practitioners a reason to use dashboard actively.
6. **Front desk workflow:** Design the exact steps for clinic staff onboarding a patient (printed card? QR code? staff enters phone number?). Don't assume.

---

## Sign-Off

Approved with conditions:
1. Must-haves are ship-blocking. Should-haves ship within 1 week of first patients.
2. Adversarial test suite (50+ cases) passes before any patient onboarding.
3. SMS budget monitoring from day 1.
4. Patient onboarding workflow for front desk documented before pilot.
5. No feature creep into Could-haves until 40%+ logging retention at 4 weeks.
