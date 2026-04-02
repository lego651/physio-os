# User Personas — PhysioOS

> Last updated: 2026-04-01

---

## Persona 1: The Recovering Patient

**Name:** Lisa Chen
**Age:** 42
**Language:** Mandarin (primary), English (functional)
**Condition:** Chronic lower back pain from desk job, sees RMT biweekly
**Tech comfort:** Uses WeChat and SMS daily, rarely downloads new apps
**Current behavior:**
- Gets exercises from RMT, does them for a few days, forgets
- Can't remember what she did between appointments
- RMT asks "how's the pain been?" — she says "about the same" because she can't recall specifics
- Googles exercises sometimes, gets overwhelmed by conflicting advice

**What she needs:**
- A way to log how she feels in 30 seconds via text message
- Someone (AI) to remind her to do exercises
- A way to show her RMT that she HAS been doing the work (or hasn't)
- To see that things are actually getting better over time (data)

**Story:**
> Lisa gets an SMS after her V-Health appointment: "Hi Lisa, I'm your V-Health recovery coach. How are you feeling after today's session? Rate your discomfort 0-3." She replies "1, a bit sore but better." Over the next week, she texts updates when she remembers, and gets a gentle nudge when she doesn't. Before her next appointment, her RMT Kyle sees a summary: "Lisa's discomfort averaged 1.4 this week, down from 2.1. She completed stretches 4/7 days. Sitting tolerance improved to 35 min."

---

## Persona 2: The Motivated Self-Tracker

**Name:** Jason (based on founder)
**Age:** 30s
**Language:** Bilingual EN/CN
**Condition:** Lower back injury (disc + muscle), 6 months into recovery
**Tech comfort:** Very high — uses AI tools, builds sub-agents
**Current behavior:**
- Logs daily in markdown files with metrics
- Tracks pain (1-10), discomfort (0-3), sitting tolerance (minutes)
- Has identified patterns (skipping stretches → worse next day)
- Sees physio monthly for confirmation

**What he needs:**
- Automated pattern detection he currently does manually
- A proper mobile interface instead of Obsidian on desktop
- To share his system with other patients who can't set it up themselves

**Story:**
> Jason is the power user. He uses the web chat to log detailed sessions, reviews weekly reports, and has identified that his 30lb weight progression protocol is working. He's the template for what every patient's experience should eventually become — but automated and simplified.

---

## Persona 3: The Practitioner

**Name:** Kyle Wu (based on real V-Health RMT)
**Age:** 30s
**Role:** Registered Massage Therapist + Acupuncturist at V-Health
**Current behavior:**
- Sees 6-8 patients per day
- Uses Jane App for booking and basic charting
- Gives patients exercise homework verbally — no way to track if they do it
- Asks "how have you been?" at start of each session — gets vague answers
- Wants patients to return regularly but has no engagement tool between visits

**What he needs:**
- To see patient recovery data before the appointment (30-second glance)
- To know which patients are falling off and need a check-in
- Something that makes his practice stand out vs. the RMT next door

**Story:**
> Kyle opens the V-Health dashboard Monday morning. He sees: "5 patients have appointments this week. Lisa's discomfort trending down. Mark hasn't logged in 8 days — consider reaching out. Sarah reported pain level 4 yesterday, up from her usual 2." He sends Mark a quick message through the system. Before Lisa's appointment, he reviews her weekly summary and adjusts her treatment plan based on actual data instead of guesses.

---

## Persona 4: The Clinic Owner

**Name:** V-Health Owner
**Role:** Business owner of V-Health Rehab Clinic
**Current tools:** Jane App (booking), Wix website, word of mouth
**Business goals:**
- Increase patient retention and rebooking rates
- Stand out from competing clinics in the area
- Build a modern, tech-forward brand image
- Reduce no-shows and cancellations

**What they need:**
- A white-label AI tool they can offer patients under the V-Health brand
- Simple dashboard showing overall patient engagement metrics
- Zero operational burden — the AI runs itself
- Marketing material: "V-Health offers AI-powered recovery coaching"

**Story:**
> The owner adds "AI Recovery Coach" to V-Health's service offerings. New patients hear about it during their first visit. The front desk helps them set up their profile. Within a month, 30% of active patients are using the coach. Rebooking rates increase because patients feel more connected to V-Health between visits. The owner sees aggregate stats: "78% of coached patients rebooked within 30 days vs. 52% of non-coached patients."

---

## Anti-Personas (NOT Our V1 Users)

| Who | Why Not |
|-----|---------|
| Self-diagnosing patients with no practitioner | We need a practitioner in the loop for safety |
| Acute injury / ER-level patients | Too serious for AI coaching; need immediate medical care |
| Patients looking for a telehealth video call | We're not a telehealth platform |
| Large hospital systems | Enterprise sales cycle too long for V1; focus on local clinics |
