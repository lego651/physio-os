# PhysioOS — Roadmap

> Owner: `physio-david` (agent). Manager: `manager-mathieu`. Last updated: 2026-05-17.
> Source of truth for current AI productization direction. Supersedes all archived roadmap docs.

---

## Status at a glance

Legend: ✅ done · 🟡 in progress · ⬜ not started · 🅿️ deferred

| # | Feature | Dev | QA | Prod | Notes |
|---|---------|-----|----|----- |-------|
| **1** | **Post-visit Review Engine** (SMS + Email → AI draft → Google Maps) | ✅ | 🟡 | ⬜ | Stage 0 functional. S1.5 UX improvements spec locked 2026-05-17 — table redesign + WeChat-style voice intake. QA remaining: unsubscribe + opt-out. Prod gated by Stage 2 prereqs. |
| 2 | In-clinic QR review prompt | 🅿️ | — | — | Deferred — attribution contamination with V-Health's existing front-desk QR. Re-evaluate after #1 has clean baseline data. |
| 3 | Post-treatment AI recovery brief | ⬜ | — | — | Phase 2+ backlog. |
| 4 | SOAP note voice transcription | ⬜ | — | — | Phase 2+ backlog. |
| 5 | Multilingual AI intake questionnaire | ⬜ | — | — | Phase 2+ backlog. Likely needed for 华人 patients. |
| 6 | AI rebooking retention (cancellation rescue) | ⬜ | — | — | Phase 2+ backlog. |
| 7 | Outcomes tracking (3 / 7 / 14-day follow-up) | ⬜ | — | — | Phase 2+ backlog. |

**Right now:** S1.5 spec approved, build starting. Scope: review requests table redesign (compact rows, global settings, per-row consent, bulk send) + WeChat-style 4-step voice intake. Spec: [docs/superpowers/specs/2026-05-17-s1.5-table-voice-design.md](superpowers/specs/2026-05-17-s1.5-table-voice-design.md). S2 Stage 0 finish (items 1.1–1.3) runs in parallel — see [s2-backlog.md](s2-backlog.md).

---

## TL;DR

**Phase 1 = 1 scenario only: S2 (Post-Visit SMS/Email Review Trigger). Locked 2026-05-16.**

- **Goal:** Deploy S2 at V-Health. Produce clean funnel data — sent, opened, clicked, converted. One scenario, one proof point.
- **Time window:** 1–2 months from first deploy (per `docs/motivation.md` — V-Health is the test case, not a long-term strategic partner).
- **Exit / stop-loss:** If S2 shows no measurable signal after the full observation window, we stop. No sunk-cost extension. (~2 months from first deploy per D10.)
- **Trigger for next phase:** S2 produces positive data at V-Health → productize and sell to clinic #2 at $99/mo. Then decide Phase 2 scope from the backlog.
- **Constraint:** Everything built for V-Health must be deployable at clinic #2 in under 20 minutes.

---

## Phase 1 (Locked)

| Scenario | Build cost | Signal in | Reuse at #2 | ROI score |
|----------|------------|-----------|-------------|-----------|
| **S2 — Google Review: SMS/Email trigger** | 3–5 days | 14 days | Near-zero (clinic name + Google URL) | **9/10** |

**All other scenarios (S1, S3, S4, S5, S6, S7) deferred to Phase 2+ Backlog. See end of document.**

---

---

## Phase 2+ Backlog

The scenarios below are fully specced and ROI-sorted. They are not in current scope. Each will be re-evaluated after S2 produces data at V-Health.

---

## S1 — Google Review: In-Clinic QR Instant Generation

> Deferred to Phase 2+. Not in current scope. Attribution contamination: V-Health already has a front-desk QR code. Shipping S1 before S2 baseline data is clean would make review count delta unreadable.

### Pitch
Patient types 2–3 words at checkout, AI generates a full Google review draft in 5 seconds, one-tap copy, straight to V-Health's Google Maps page — under 45 seconds total.

### Patient flow
1. Therapist hands patient a printed QR card at checkout ("Leave us a review?").
2. Patient scans QR on personal phone — opens a single-screen web page (no login, no app).
3. Patient types 2–3 words describing their visit (e.g. "back pain relief, fast").
4. Claude generates a personalized 3–4 sentence Google review draft. Displayed immediately.
5. Patient taps "Copy" → one-tap → taps "Open Google Maps" → pastes and submits.
6. Done. No account, no back-and-forth. End-to-end under 45 seconds.

### Clinic flow
- **Onboard:** Jason provides clinic name + Google Maps review URL + therapist list. One configuration object in the app. Done in 10 minutes.
- **Config:** No ongoing config. QR card is a static printed card (URL never changes). Reprint only if URL changes.
- **Dashboard:** Admin sees count of review drafts generated per day/week. No patient PII required (no login = no identity).

### AI entry point
- **Step:** Between patient typing 2–3 words and receiving the draft.
- **Model:** Claude Haiku 4.5 (fast, cheap, single-turn). No conversation history needed.
- **Prompt core:** System prompt includes clinic name, therapist list, and city. User message is the 2–3 words. Output is a draft review in the patient's apparent language (auto-detect). Guardrail: must be about the clinic, must not fabricate services not in the system prompt, must be ≤150 words.
- **Why not template:** Templates produce generic reviews Google filters as spam. Claude variations pass the "human wrote this" heuristic because each draft responds to the specific words the patient typed.

### Technical architecture
Single Next.js API route: `POST /api/review/generate` — receives `{clinicId, keywords}`, verifies Turnstile token, calls Claude Haiku, returns `{draft}`. Frontend at `/review/[clinicId]` — no auth, Cloudflare Turnstile invisible, rate-limited (5 requests/IP/day).

### Core mechanism problems and solutions
- **Problem:** Patient stares at blank Google review box and gives up. **Solution:** Pre-filled draft removes the cognitive block. Patient becomes editor, not author.
- **Problem:** Generic reviews look fake and get suppressed by Google. **Solution:** Each draft is seeded by the patient's own words — unique enough to pass quality filters.
- **Problem:** Clinic staff forget to prompt patients. **Solution:** QR card is physical and persistent — staff hand it out as part of checkout routine, not an extra step.

### Measurable effect
- **Baseline:** CFO records V-Health Google review count before launch (already flagged as pre-launch task).
- **Target:** 3× review velocity in first 30 days vs trailing 30-day average.
- **Attribution:** All reviews generated via this tool are from patients who came through the QR flow. Delta in review count vs baseline is the signal.
- **30-day check:** Review count delta, draft generation count, drop-off rate (generated draft but did not open Google Maps link).
- **60-day check:** Is the rate holding? Are reviews passing Google's quality filter (i.e., showing publicly)?

### API draft
```
POST /api/review/generate
Body: { clinicId: string, keywords: string, turnstileToken: string }
Response: { draft: string, language: "en" | "zh" }

GET /api/review/stats?clinicId=vhealth&days=30
Response: { draftsGenerated: number, linkClickRate: number }
```

---

## S2 — Google Review: Post-Visit SMS/Email Trigger

> **Phase 1 — Locked 2026-05-16.** Only scenario in current scope. Jason's final call, overriding PM + Mathieu recommendations. See "Why S2 first (not S1)" below.

### Why S2 first (not S1)

V-Health already has a front-desk QR code pointing patients to Google Maps. If we ship S1 (another QR code), we cannot separate which reviews came from our QR and which came from the existing one. Attribution is contaminated from day one — any review count delta becomes unreadable noise.

S2 is immune to this problem. Every SMS and email we send is a discrete, tracked event. The funnel is clean by construction:

- **Sent** — Twilio/Resend delivery confirmation
- **Opened** — email pixel or SMS click-through via short link
- **Clicked through** — landing page visit logged per token
- **Review intent** — copy-button click (proxy for "they actually used the draft")
- **Converted** — Google review count delta cross-referenced against 30-day baseline (CFO captured pre-launch)

This is Jason's call (2026-05-16). PM and Mathieu argued S1 is cheaper and faster. That is correct on build cost. It is wrong on measurement — a contaminated attribution makes the data useless for the clinic #2 sales conversation.

### Measurable Funnel

| Step | Signal | How tracked |
|------|--------|-------------|
| Sent | Delivery receipt | Twilio delivery webhook / Resend event |
| Opened | Email open / SMS link click | Email pixel (Resend) / unique short URL click |
| Click-through | Landing page visit | Token-scoped server log (`/review?t=[token]`) |
| Review intent | Copy-button click | `POST /api/review-request/track { event: "copied" }` |
| Converted | Google review count delta | CFO baseline (captured pre-launch) vs 30-day count |

### Pitch
24 hours after a visit, the patient gets a text (or email) with a pre-written Google review draft — they just paste and submit. No QR card, no "remember to ask at checkout." Works even for the 60% of patients who leave before staff can prompt them.

### Patient flow
1. Patient completes their appointment. Leaves the clinic.
2. 24 hours later: patient receives SMS (or email) from V-Health — "Thanks for your visit with [Therapist]. Here's a quick review draft if you'd like to share your experience: [link]"
3. Patient taps link → opens single-screen page (no login) with their pre-generated review draft.
4. Patient taps "Copy" → opens Google Maps link → pastes → submits.
5. Done. Total active time: under 60 seconds.

### Clinic flow
- **Onboard:** Jason configures clinic name + Google Maps review URL + therapist list + CASL consent confirmation. Provisioning target: 20 minutes.
- **Trigger (pilot):** Admin page at `/admin/review-requests`. Staff enters patient name + phone/email + therapist name → clicks "Send review request." Manual for now — no booking system integration required.
- **Trigger (post-pilot):** Webhook from booking system on visit-complete event. Blocked until V-Health grants JaneApp API access. Do not promise this in Phase 1.
- **Config:** SMS vs Email is a per-send choice at the admin page. Both adapters live from day one (single `ReviewRequestEngine` with `SmsAdapter` + `EmailAdapter` — this abstraction IS the cross-clinic SKU).
- **Dashboard:** Admin sees all sent requests, open rate (email), click rate, and whether the patient visited the Google Maps link.

### AI entry point
- **Step:** At send time, Claude generates a personalized review draft for this specific patient + therapist combination. Draft is embedded in the SMS/email body or at the landing page (both options — test which converts better).
- **Model:** Claude Haiku 4.5. Single-turn. Input: `{clinicName, therapistName, treatmentArea (optional), patientFirstName}`. Output: a 3–4 sentence review draft in English (default) or detected preferred language.
- **Prompt core:** "Generate a genuine-sounding Google review for [clinicName] as if written by a patient who was treated by [therapistName] for [treatmentArea]. 80–130 words. First-person. Specific to the treatment type. Do not fabricate outcomes. End with a recommendation."
- **Why not template:** Same as S1 — unique drafts pass Google's quality filter. Template reviews cluster around the same phrases and get suppressed or flagged.

### Technical architecture
`ReviewRequestEngine` class with two adapters: `SmsAdapter` (Twilio, Canadian outbound ~$0.008/SMS) and `EmailAdapter` (Resend, free tier covers pilot). Tokenized landing page at `/review?t=[JWT]` — 48h expiry, single-use token. Admin trigger at `/admin/review-requests`. One cron job checks for expired tokens and marks them void.

### Core mechanism problems and solutions
- **Problem:** 60% of patients intend to review but forget by the time they get home. **Solution:** 24h delay hits when the memory is fresh but the patient is no longer in the friction-filled checkout moment.
- **Problem:** CASL compliance — sending SMS/email requires explicit consent. **Solution:** For V-Health pilot: founder-accepted risk (Jason verbatim: "we can assume they have consent"). MUST be reinstated (consent checkbox at booking) before clinic #2. This is a hard gate, not a nice-to-have.
- **Problem:** Patients ignore generic "please review us" texts. **Solution:** Personalized draft with their therapist's name — feels like a thoughtful follow-up, not spam.
- **Problem:** Link rot — if patient opens the link after 48h, it should degrade gracefully. **Solution:** Token expiry returns a "this link has expired" page with the Google Maps review URL directly, so the patient can still submit manually.

### Measurable effect
- **Baseline:** Review count + send volume baseline (week 1 is control: zero sends).
- **Target:** 15% of SMS/email recipients click through to Google Maps within 48h. 10% of those actually submit a review (cross-checked against Google review count delta).
- **Attribution:** Each token is unique per send. We know exactly which sends resulted in a Google Maps click. Review count delta tells us the downstream conversion.
- **30-day check:** Sends, click rate, estimated review-submission rate, unsubscribe/complaint rate.
- **60-day check:** Google review count total delta vs baseline. Compare S1 (in-clinic QR) vs S2 (post-visit text) conversion rates — which channel dominates.

### API draft
```
POST /api/review-request/send
Body: { clinicId, patientName, contactType: "sms"|"email", contactValue, therapistName, treatmentArea? }
Response: { requestId, tokenExpiresAt }

GET /review?t=[token]
Returns: landing page with pre-generated draft + copy + Google Maps link

POST /api/review-request/track
Body: { token, event: "opened"|"copied"|"maps_clicked" }
Response: { ok: true }
```

---

## S3 — Post-Treatment AI Recovery Brief

> Deferred to Phase 2+. Not in current scope.

### Pitch
Right after their appointment, the patient receives a short AI-written "recovery brief" — what was treated today, what to do tonight, what to avoid for 48 hours. Therapist spends 10 seconds triggering it. Patient feels cared for between visits. Rebooks at higher rate.

### Patient flow
1. Patient completes appointment.
2. Within 2 hours (or same evening), patient receives SMS or email: "Hi [Name], here's a brief summary from your session today with [Therapist]."
3. Message includes: (a) what was treated, (b) 2–3 specific post-care instructions (e.g. "apply ice for 15 min tonight"), (c) when to rebook ("optimal next session: 1–2 weeks").
4. Patient saves or screenshots it. Follows instructions. Returns for next booking with documented context.

### Clinic flow
- **Onboard:** Clinic name + therapist list + CASL consent gate + treatment type taxonomy. 20-minute provisioning.
- **Trigger:** Therapist logs session in physio-os internal tool (or admin page): selects patient + therapist + treatment area + session notes (voice or text). System generates and sends the brief automatically.
- **Config:** Clinic can toggle brief format (short/long), language default (English/Chinese), and delivery channel (SMS/email/both).
- **Dashboard:** Therapist sees sent briefs, whether patient opened them, and a "rebooking flag" if brief recommended rebook and no booking appeared within 14 days.

### AI entry point
- **Step:** Between therapist logging the session and the brief being sent.
- **Model:** Claude Haiku 4.5. Input: `{clinicName, therapistName, treatmentArea, sessionNotes (optional), patientFirstName, visitDate}`.
- **Prompt core:** "You are a clinical communications assistant for [clinicName]. Write a patient-friendly post-visit recovery brief for a patient treated by [therapistName] for [treatmentArea]. Include: (1) what was done today in plain language, (2) 2–3 specific home care instructions for the next 48 hours, (3) recommended rebooking window. Tone: warm, professional. Length: 80–120 words. Do not fabricate medical claims. Do not use jargon."
- **Why not template:** Treatment areas vary (RMT vs OMT vs acupuncture), patient conditions vary, session progress varies. A fixed template produces the same generic text every visit — patients stop reading after the second one.

### Technical architecture
Session logging at `/admin/sessions/new` (form: patient + therapist + treatment area + notes). On submit: Claude generates brief, stores it, queues Twilio/Resend send via same `ReviewRequestEngine` infrastructure. Tokenized link optional (if clinic wants to track opens). Cron: flag unread briefs after 24h.

### Core mechanism problems and solutions
- **Problem:** Patients forget what they were told post-session. **Solution:** Written brief they can refer back to — solves the #1 patient complaint ("I can't remember what you said I should do").
- **Problem:** Therapist time cost. **Solution:** Logging takes 10 seconds (treatment area from dropdown, notes optional). AI does the writing.
- **Problem:** Same message every visit feels like spam. **Solution:** Claude varies the brief based on treatment area + any session notes. Each message is contextually different.
- **Problem:** "Rebooking recommendation" feels pushy. **Solution:** Frame it as clinical — "optimal recovery window" not "book now."

### Measurable effect
- **Baseline:** V-Health's current average rebooking rate (ask David Wang or extract from JaneApp).
- **Target:** 10% lift in rebooking rate within 60 days for patients who receive briefs vs those who don't.
- **Attribution:** Track which patients received briefs (log it) vs which did not. JaneApp rebooking data is the outcome. Two-group comparison over 30–60 days.
- **30-day check:** Brief send rate, open rate (if tokenized), therapist adoption rate (are all therapists logging sessions?).
- **60-day check:** Rebooking rate delta between brief-received and brief-not-received groups.

### API draft
```
POST /api/sessions
Body: { clinicId, therapistId, patientId, treatmentArea, notes?, sendBrief: boolean }
Response: { sessionId, briefScheduled: boolean }

GET /api/sessions?clinicId=vhealth&days=30
Response: { sessions: [...], briefSentCount, openRate, rebookingFlagCount }
```

---

## S4 — SOAP Note Voice Transcription

> Deferred to Phase 2+. Not in current scope.

### Pitch
Therapist speaks a 30-second voice memo after a session. AI transcribes it and formats it into a structured SOAP note, saved to the patient's record. Ends the 100-patient intake backlog David Wang mentioned explicitly as his #1 internal pain.

### Patient flow
No patient-facing component. Internal tool only.

### Clinic flow
- **Onboard:** Therapist list + patient roster (can import from JaneApp export). Admin page only. 20-minute provisioning.
- **Trigger:** Therapist opens physio-os internal app (mobile-optimized), selects patient from list, taps "Record." Speaks for 20–60 seconds. Taps "Stop." AI transcribes and formats.
- **Review:** Transcribed SOAP note appears on screen. Therapist reviews, edits any corrections (1–2 taps usually), taps "Save."
- **Output:** Note saved to patient record. Available for PDF export from `/dashboard/patients/[id]`.
- **Dashboard:** Admin sees notes per therapist per day, total backlog clearance rate, average recording length.

### AI entry point
- **Step 1:** Voice memo → text via Whisper (OpenAI or self-hosted via OpenClaw VPS — spike required to test accuracy on Canadian-accented English + TCM terminology).
- **Step 2:** Raw transcript → structured SOAP note via Claude Haiku. Input: `{rawTranscript, treatmentArea, patientName}`. Output: structured `{S: ..., O: ..., A: ..., P: ...}` JSON.
- **Prompt core:** "You are a clinical documentation assistant. Convert the following raw voice transcript from a physiotherapy/massage/acupuncture session into a formatted SOAP note. Use standard clinical language. Fill in each section (Subjective, Objective, Assessment, Plan) based on what was stated. If a section is not mentioned in the transcript, write 'Not documented.' Do not fabricate clinical findings."
- **Why not template:** SOAP notes require clinical judgment about what goes in which section. Raw speech is unstructured. Template parsing cannot handle the variance in how different therapists speak.

### Technical architecture
Mobile-first web page at `/sessions/record`. Uses browser `MediaRecorder` API (path B) for audio capture — Telegram-first path (path A) if MediaRecorder accuracy is insufficient on older Android. Audio file uploaded to Supabase Storage. Background job: Whisper transcription → Claude SOAP formatting → store in `session_notes` table. PDF export via server-rendered route.

### Core mechanism problems and solutions
- **Problem:** 100-patient backlog because manual entry is too slow. **Solution:** 30-second voice memo replaces 5-minute typed entry. Clears the backlog in a week of normal use.
- **Problem:** Whisper accuracy on medical terminology. **Solution:** System prompt includes a clinic-specific glossary (treatment names, therapist jargon). Spike on Day 1 with 5 real recordings — if accuracy is under 80%, switch to in-app MediaRecorder + Claude direct transcription.
- **Problem:** Therapist trust — "what if it gets the SOAP wrong?" **Solution:** Review step is mandatory. AI creates the draft; therapist approves with full edit access. Positioned as "AI saves you from blank-page syndrome, not AI replaces your clinical judgment."
- **Problem:** Mobile UX friction. **Solution:** Single-tap record, single-tap stop. No typing required until the review step.

### Measurable effect
- **Baseline:** 100-patient backlog (David Wang's stated number). Zero SOAP notes currently in physio-os.
- **Target:** 50% of backlog cleared (50 records) within 30 days of deployment. All new sessions have SOAP notes within 24h of visit.
- **Attribution:** Note count in physio-os vs zero baseline. Backlog number sourced from David Wang at onboard.
- **30-day check:** Notes created, backlog reduction, therapist adoption rate, average recording length, Whisper accuracy (manual spot check on 10 notes).
- **60-day check:** Is the habit sticky? Are therapists logging new sessions same-day?

### API draft
```
POST /api/sessions/voice
Body: { clinicId, therapistId, patientId, audioFile: File }
Response: { jobId }

GET /api/sessions/voice/:jobId
Response: { status: "processing"|"done"|"error", soapNote?: { S, O, A, P } }

POST /api/sessions/voice/:jobId/confirm
Body: { soapNote: { S, O, A, P } }
Response: { sessionId, noteId }
```

---

## S5 — Multilingual AI Intake Questionnaire

> Deferred to Phase 2+. Not in current scope.

### Pitch
New patient fills in a pre-visit questionnaire on their phone in their preferred language. AI translates and structures it into English for the therapist. No paper forms, no language barrier, no front-desk translation work.

### Patient flow
1. When booking (or on arrival), patient receives a link: "Please complete your intake form before your appointment."
2. Patient opens a mobile web page. Selects language (English / Chinese / other). Fills in: name, date of birth, reason for visit, pain area, pain scale (1–10), previous treatments, medications, insurance details.
3. Form submitted. Patient gets a "You're all set" confirmation.
4. Therapist sees the English-formatted intake in their dashboard before the appointment.

### Clinic flow
- **Onboard:** Clinic configures: field set (standard 8 fields, or custom — add/remove fields per clinic), language options, and booking link integration (or standalone URL for walk-ins). 20-minute provisioning for standard field set; variable for custom.
- **Config:** Clinic can toggle which fields are required vs optional, set the default language, and configure whether the intake form link is sent automatically (webhook on booking) or manually (admin sends link on demand).
- **Dashboard:** Therapist sees all submitted intake forms per day, filterable by therapist. Can export to PDF for insurance records.

### AI entry point
- **Step:** Between patient submitting the form in Chinese (or other language) and therapist seeing the structured English record.
- **Model:** Claude Haiku 4.5. Input: `{rawFormData, submittedLanguage, targetLanguage: "en"}`.
- **Prompt core:** "Translate and structure the following patient intake data from [language] to English. Preserve medical specificity — do not generalize pain descriptions. Output as structured JSON matching the standard intake schema. Do not add or remove information."
- **Why not Google Translate:** Google Translate does not handle medical context well, particularly Chinese traditional medicine terminology. Claude maintains clinical specificity. Also, Claude can handle free-text fields (e.g. "describe your pain") where Google Translate produces awkward clinical phrasing.

### Technical architecture
Form page at `/intake/[clinicId]`. Form submission hits `POST /api/intake`. If submitted language is not English, Claude translates and structures. Result stored in `patient_intakes` table. Therapist dashboard at `/dashboard/intakes` shows today's submissions. PDF export server-rendered.

### Core mechanism problems and solutions
- **Problem:** Chinese-Canadian patient pool — front desk currently translates verbally, which adds time and loses nuance. **Solution:** Patient self-serves in their language. Therapist gets clean English record.
- **Problem:** Patient drops off if form is too long. **Solution:** 8 standard fields, mobile-first layout, single page. No pagination. Optional fields are visually de-emphasized.
- **Problem:** Per-clinic field configuration makes provisioning slow. **Solution:** Standard field set ships by default. Custom fields are an upsell, not a gate. Clinic #2 gets the same standard 8 fields in 20 minutes.
- **Problem:** Insurance detail accuracy. **Solution:** Those fields are free-text, not parsed by AI — patient types exactly what's on their insurance card. No AI interpretation of insurance data.

### Measurable effect
- **Baseline:** Zero digital intake forms. Current process: paper or verbal. Count of paper forms per week from David Wang.
- **Target:** 80% of new patients use the digital form within 30 days of launch.
- **Attribution:** Count of digital intake submissions vs total new patient bookings in same period (get total new bookings from JaneApp).
- **30-day check:** Submission rate, completion rate (started vs submitted), language distribution (how many Chinese vs English).
- **60-day check:** Is therapist satisfaction higher? (Informal: ask 3 therapists whether they're looking at the intake before sessions.) Are there insurance billing errors traced back to intake data gaps?

### API draft
```
POST /api/intake
Body: { clinicId, patientData: { name, dob, reasonForVisit, painArea, painScale, previousTreatments, medications, insurance }, language }
Response: { intakeId, confirmationCode }

GET /api/intake/:intakeId
Response: { structuredData (English), originalLanguage, submittedAt }
```

---

## S6 — AI Rebooking Retention (Cancellation Rescue)

> Deferred to Phase 2+. Not in current scope.

### Pitch
When a patient cancels or misses an appointment, physio-os sends them a personalized AI message within 1 hour — not a generic reminder, but a specific message referencing their treatment and why continuity matters. Converts some cancellations back into bookings before the slot goes to waste.

### Patient flow
1. Patient cancels appointment (via JaneApp, phone, or text). Or no-shows.
2. Within 1 hour: patient receives SMS (or email) from V-Health: "Hi [Name], we noticed you had to cancel your session with [Therapist] on [Date]. For [treatment type], consistency really matters for results. We have [X] open slots this week — [link to rebook]."
3. Patient taps rebook link → JaneApp booking page (pre-filtered to same therapist if possible).
4. If patient does not respond within 24h: one follow-up message (different copy, lower pressure tone).
5. If patient books: log as a rescue. If not: stop outreach (no spam).

### Clinic flow
- **Onboard:** Clinic connects cancellation trigger (initially: manual — admin clicks "Send rescue" on cancellation dashboard row). Post-pilot: JaneApp webhook on cancellation event.
- **Config:** Rescue delay (default: 1h after cancellation), max messages per patient per month (default: 2), opt-out list management.
- **Dashboard:** Admin sees all cancellations, which ones triggered rescue messages, and which resulted in rebookings. "Rescue conversion rate" as primary KPI.

### AI entry point
- **Step:** Between cancellation event and message send.
- **Model:** Claude Haiku 4.5. Input: `{clinicName, therapistName, treatmentArea, patientFirstName, cancellationType: "cancelled"|"no_show", availableSlots (optional)}`.
- **Prompt core:** "Write a warm, non-pushy rebooking message for a patient who cancelled a [treatmentArea] appointment at [clinicName]. Reference why treatment continuity matters for [treatmentArea] in one specific, factual sentence. Suggest rebooking. Keep it under 100 words. First person from the clinic. Do not guilt-trip. Do not offer discounts."
- **Why not template:** Generic cancellation recovery texts have very low open rates. A message that names the specific treatment type and therapist reads as personal, not automated.

### Technical architecture
Cancellation event handled at `POST /api/cancellations` (initially posted manually from admin dashboard; later from JaneApp webhook). Queues rescue message via `ReviewRequestEngine` (same SMS/email infrastructure). Rescue attempts logged in `cancellation_rescues` table. Cron: check for unrebooked rescues at 24h, send follow-up if within max-attempts limit.

### Core mechanism problems and solutions
- **Problem:** Cancellation = lost revenue + empty slot. 24h cancellation policy exists but doesn't bring the patient back. **Solution:** Proactive outreach within 1h changes the frame from "you cancelled" to "here's how to get back on track."
- **Problem:** Patients get annoyed by too many messages. **Solution:** Hard cap at 2 messages per patient per month. One-click opt-out in every message. Aggressive spam prevention in code.
- **Problem:** No-shows vs cancellations require different tone. **Solution:** Two distinct prompt variants — cancellation is gentler ("we know life gets busy"), no-show is warmer ("we wanted to check in").
- **Problem:** Available slots data requires JaneApp integration we don't have in Phase 1. **Solution:** Omit specific slot suggestions in Phase 1 — just link to the general JaneApp booking page.

### Measurable effect
- **Baseline:** V-Health's current cancellation rate and rebooking rate post-cancellation (ask David Wang for monthly stats or extract from JaneApp).
- **Target:** 15% of cancelled appointments result in a rebook within 7 days, up from whatever the current baseline is.
- **Attribution:** Log each rescue attempt and whether the patient booked within 7 days. JaneApp booking data is the confirmation.
- **30-day check:** Rescue messages sent, response rate, rebook conversion rate, opt-out rate.
- **60-day check:** Net revenue recovered. (Sessions rescued × avg session price.) Is the opt-out rate acceptable (<5%)?

### API draft
```
POST /api/cancellations
Body: { clinicId, patientId, therapistId, treatmentArea, cancellationType: "cancelled"|"no_show", appointmentDate }
Response: { cancellationId, rescueScheduled: boolean }

GET /api/cancellations/rescues?clinicId=vhealth&days=30
Response: { rescuesSent, rebookRate, optOutRate }
```

---

## S7 — Outcomes Tracking (3/7/14-Day Check-In)

> Deferred to Phase 2+. Not in current scope.

### Pitch
3 days after treatment, patient gets a short AI-generated check-in text: "How's your [back pain] since your session with [Therapist]?" Patient replies with a number (1–10) or short text. Therapist sees a trend line. Patient feels monitored and cared for. Rebooking conversation becomes data-driven.

### Patient flow
1. Patient completes appointment. System logs treatment area.
2. Day 3: patient receives a text: "Hi [Name], quick check-in — on a scale of 1–10, how's your [back] since your session with [Therapist] on [Date]? Reply with a number or a few words."
3. Patient replies (SMS reply or web link — both supported). AI processes the response and logs it.
4. Day 7: second check-in (shorter — "Still improving?").
5. Day 14: third check-in, with rebooking suggestion if response indicates ongoing symptoms.
6. Patient sees their own trend data at `/my-progress/[token]` (optional — tokenized, no login required).

### Clinic flow
- **Onboard:** Clinic connects check-in trigger to session logging (same session log as S3/S4). Configures check-in cadence (default: 3/7/14 days) and opt-out handling.
- **Config:** Which treatment areas trigger check-ins (default: all). Language for check-in messages (English/Chinese). Whether patient-facing progress page is enabled.
- **Dashboard:** Therapist sees outcome scores per patient per treatment area over time. Flags patients with deteriorating scores ("score dropped from 7 to 4 between day 3 and day 7") for proactive outreach.

### AI entry point
- **Step 1:** Generating the check-in message. Input: `{clinicName, therapistName, treatmentArea, dayNumber: 3|7|14, previousScore? }`. Output: a natural-sounding check-in question (not a clinical survey).
- **Step 2:** Interpreting free-text patient responses. Input: `{patientReply}`. Output: `{sentiment: "improving"|"stable"|"worsening", numericScore: 1-10, suggestRebook: boolean}`.
- **Model:** Claude Haiku 4.5 for both steps.
- **Why not a fixed survey:** A fixed survey ("rate your pain 1–10") gets low response rates. A conversational, named, personalized message ("how's your back since your session with Michelle?") gets 2–3× higher response rates. The AI also interprets free-text replies that a fixed survey cannot handle.

### Technical architecture
Session log triggers a scheduled job for 3 check-ins (cron at 72h / 168h / 336h post-session). Outbound via `ReviewRequestEngine` (SMS/email). Inbound SMS via Twilio webhook at `POST /api/sms/inbound` (already exists in repo). Inbound parsed by Claude → score logged to `patient_outcomes` table. Progress page at `/my-progress/[token]` (server-rendered, tokenized JWT).

### Core mechanism problems and solutions
- **Problem:** Therapist has no visibility into how patient is doing between visits. **Solution:** Structured outcome data in the dashboard — trend line per patient, flag for deteriorating scores.
- **Problem:** Low response rate on generic surveys. **Solution:** Conversational, therapist-named messages outperform survey links by 2–3× (evidence from similar health-tech products).
- **Problem:** Patient ignores all 3 messages. **Solution:** Hard stop after 3 messages per episode of care. No spam.
- **Problem:** Free-text response interpretation is unreliable. **Solution:** Claude normalizes any response ("my back feels much better" → score 8, improving) with a confidence flag. Low-confidence interpretations are flagged for manual review, not auto-logged.

### Measurable effect
- **Baseline:** Zero outcome data for V-Health patients currently. No trend tracking in JaneApp.
- **Target:** 30% response rate on day-3 check-ins within first 30 days. 20% on day-7. 15% on day-14.
- **Attribution:** All responses are logged to a specific session (patient + therapist + date). Response rate = responses / sends for each day-point.
- **30-day check:** Response rates per check-in day, outcome score distribution, flag rate (how many patients show deteriorating trends), therapist adoption of dashboard.
- **60-day check:** Does outcome data predict rebooking? (Patients with worsening scores at day 7 — do they rebook at higher rates when therapist proactively reaches out vs when they don't?)

### API draft
```
POST /api/outcomes/checkin
Body: { clinicId, sessionId, dayNumber: 3|7|14 }
Response: { messageId, scheduledAt }

POST /api/sms/inbound (existing Twilio webhook)
Handles: patient reply → Claude interpret → log to patient_outcomes

GET /api/outcomes?clinicId=vhealth&patientId=xxx
Response: { outcomes: [{ date, score, sentiment, dayNumber }], trend: "improving"|"stable"|"worsening" }
```

---

## What Phase 1 Does NOT Include

These items are explicitly out of Phase 1 scope. Do not build them.

| Item | Why excluded | When to revisit |
|------|-------------|-----------------|
| JG Attribution Widget | No site traffic data — would be theatre (Jason verbatim 2026-05-05) | When V-Health site analytics exist |
| CASL consent gate reinstatement | Pilot-only skip (founder-accepted risk). V-Health only. | Before clinic #2 — non-negotiable hard gate |
| JaneApp webhook integration | Requires API access Jason does not have yet | When David Wang grants JaneApp access |
| Auto-post Google reviews (OAuth) | Policy risk + multi-day build | Never — copy-paste only |
| Wix integration | Standalone Vercel deploys only | N/A |
| vhealth-kitty / vhealth-reportor activation | No wins to publish yet | After at least 1 scenario produces positive data |
| Multi-clinic admin panel | Phase 2, after at least 1 scenario validates | Phase 2 |
| SMS patient coaching (original S1–S6 patient product) | Paused. V2 hypothesis (virtual coach) surfaces at Phase 2 ELT | Phase 2 ELT review |

---

*Phase 1 locked 2026-05-16. Jason's final call: S2 only. PM + Mathieu notified via parent agent. Next discussion TBD — Jason: "no next steps needed yet, more discussion to come."*
