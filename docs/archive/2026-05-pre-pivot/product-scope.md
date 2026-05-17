# Product Scope & Roadmap — PhysioOS

> Last updated: 2026-04-01
> Internal project name: physio-os
> First deployment: vhealth.ai (white-label for V-Health Rehab Clinic)

---

## Vision

Make recovery measurable, guided, and connected — for every patient, every practitioner.

## Core Values

1. **Data over feelings** — Quantify what's hard to measure. Pain scores, discomfort levels, sitting tolerance. Trends tell the truth.
2. **Effortless for patients** — If logging takes more than 30 seconds, we've failed. Meet patients where they are (SMS, web).
3. **Practitioner in the loop** — AI advises, practitioners confirm. We never replace clinical judgment.
4. **White-label first** — Clinics own the patient relationship. We power the experience behind their brand.
5. **Ship and learn** — Build for 20 users, learn, then scale. No over-engineering.

---

## V1 — "The Companion" (MVP)

> Goal: Deploy to V-Health with 20-30 patients. Validate that patients actually log daily and that practitioners find summaries useful.

### Patient Features

#### Passive (patient-initiated)

| Feature | Description |
|---------|-------------|
| **Web chat** | Full conversational interface on vhealth.ai — patient talks to AI recovery coach |
| **SMS chat** | Patient texts their V-Health number; AI responds via SMS. Supports MMS (images) |
| **Daily logging** | Patient describes how they feel in natural language; AI extracts and stores metrics |
| **Metric tracking** | Pain (1-10), discomfort (0-3), sitting tolerance (minutes), exercise completion |
| **Recovery Q&A** | Patient asks questions about their recovery; AI responds within guardrails |
| **Bilingual support** | AI responds in the language the patient uses (English or Chinese) |
| **View progress** | Patient can ask "how am I doing?" and get a summary with trends |

#### Active (system-initiated)

| Feature | Description |
|---------|-------------|
| **Weekly progress report** | SMS with link to web report — charts, trends, insights |
| **Inactivity nudge** | "Hey Lisa, we haven't heard from you in 3 days. How are you feeling?" |
| **Pattern detection** | "Your discomfort tends to spike when you skip evening stretches" |
| **Exercise reminders** | Based on patient's daily routine, remind at the right time |

### Clinic Features

#### Passive (clinic-initiated)

| Feature | Description |
|---------|-------------|
| **Admin dashboard** | Single admin login for V-Health owner/staff |
| **Patient list** | See all enrolled patients, last activity, current status |
| **Patient detail** | View individual patient's metrics, logs, AI-generated summaries |
| **Shared reports** | When patient opts in, practitioner sees recovery reports |

#### Active (system-initiated)

| Feature | Description |
|---------|-------------|
| **Inactive patient alerts** | "3 patients haven't logged in 5+ days" |
| **Pre-appointment summary** | Before a booked session, send practitioner a recovery summary |
| **Anomaly alerts** | "Sarah reported pain level 6 yesterday, up from her usual 2" |

### Patient Profile (based on founder's system)

```
Patient Profile:
- Name, age, language preference
- Injury/condition description
- Diagnosis (if provided by practitioner)
- Current symptoms
- Pain triggers
- Current treatment plan (practitioner, frequency)
- Daily routine / schedule
- Recovery goals (e.g., "sit 60 min without discomfort by April")
- Metric baselines (initial pain/discomfort scores)
```

### What V1 Does NOT Include
- Exercise library / training videos
- Appointment booking
- Payment processing
- Community features
- E-commerce
- Multi-clinic management
- Mobile app (native)
- WhatsApp / WeChat / Telegram integration

---

## V2 — "The Platform"

> Goal: Onboard 3-5 clinics. Add booking and exercise library to increase stickiness.

| Feature | Description |
|---------|-------------|
| Appointment booking | Replace or integrate with Jane App for scheduling |
| Exercise library | Curated videos; practitioner drags exercises into patient's plan |
| Smart logging | Patient says "I did 1, 2, 3" — AI logs specific exercises from their plan |
| Multi-clinic support | Each clinic gets their own branded instance |
| Practitioner accounts | Individual logins per practitioner (not just clinic-level admin) |
| WhatsApp integration | Broader reach for non-SMS markets |
| Telegram bot | For tech-comfortable users who prefer it |
| Patient consent workflows | Formal opt-in for data sharing with practitioners |
| Advanced analytics | Clinic-wide trends, patient cohort analysis |

---

## V3 — "The Ecosystem"

> Goal: Launch consumer-facing app. Expand beyond physio/RMT.

| Feature | Description |
|---------|-------------|
| Consumer app | Anyone can sign up without a clinic (connect to local practitioners) |
| Practitioner marketplace | Patients find and connect with local practitioners |
| Community | Discussion forums — patients with similar conditions support each other |
| E-commerce | Curated recovery product recommendations and reviews |
| Gym trainer support | Same model adapted for fitness coaching |
| Nutrition tracking | Food logging + dietary coaching integration |
| AI-generated exercise content | Video demonstrations created/curated by AI |
| Multi-language expansion | French, other languages |

---

## Success Metrics

### V1 Success Criteria (first 90 days)
- 20+ patients enrolled at V-Health
- 50%+ patients log at least 3x per week after first month
- 80%+ practitioners say pre-appointment summaries are useful
- Patient NPS > 40
- SMS costs < $50/month
- Zero safety incidents (AI giving harmful advice)

### Leading Indicators
- Daily active loggers / total enrolled
- Average logs per patient per week
- Practitioner dashboard login frequency
- Patient-initiated vs. system-initiated interactions ratio
- Rebooking rate for coached vs. non-coached patients
