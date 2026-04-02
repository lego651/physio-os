# PhysioOS — CEO Review & Strategic Plan

**Date:** April 1, 2026
**Classification:** Internal — Leadership Team Only

---

## Executive Summary

PhysioOS targets a genuine gap: no incumbent offers a conversational AI recovery companion between appointments. The V-Health pilot is the right first move — low cost, high signal, founder-adjacent. The plan needs scope discipline, legal foundations before launch, and a hard billing trigger to prevent indefinite free piloting.

---

## Challenges Addressed

### 1. V1 Scope Trimmed
The original V1 was a product, not an MVP. Agreed cuts: pattern detection is Sprint 4 (ships after core loop), exercise reminders and recovery Q&A are V2, pre-appointment summaries need Jane App integration (V2). Core V1 = SMS chat + web chat + metric extraction + basic dashboard + weekly report.

### 2. White-Label Is Post-Validation
No multi-tenant infrastructure in V1. Deploy to vhealth.ai with V-Health branding in config vars. Dynamic slug routing, custom domains, and theming move to V2 when clinic #2 signs.

### 3. Bilingual Stays In V1
CEO proposed cutting bilingual. Overruled by PM and Tech Lead — half of V-Health patients are Chinese-speaking. Bilingual is a system prompt instruction in Claude, not an engineering project. Cutting it removes half the pilot users.

### 4. 60-Day Billing Trigger
V-Health pilot is free for 60 days from first patient enrollment. Day 61, billing starts at $199/month + $5/active patient/month. Communicated day 1. No extensions.

### 5. Legal Before Launch
PIPEDA compliance is non-negotiable. Budget $3-5K for lawyer review. Consent flow built into patient onboarding (Sprint 2). Privacy policy live before first patient.

---

## Q2 2026 OKRs (April — June)

### Objective 1: Launch V1 and Prove Patients Will Log

| Key Result | Target | By |
|------------|--------|-----|
| Ship V1 to production, enroll first patient | First patient message received | May 15 |
| Enroll 20 patients at V-Health | 20 patients in DB | Jun 15 |
| 40%+ patients enrolled 2+ weeks log at least 3x/week | Weekly active loggers / eligible | Jun 30 |
| Zero AI safety incidents | Incident log = 0 | Ongoing |

### Objective 2: Prove Practitioner Value

| Key Result | Target | By |
|------------|--------|-----|
| Deliver weekly summaries to 2+ V-Health practitioners | Summary delivery logs | May 31 |
| 80%+ practitioners rate summaries "useful" | Survey (n >= 2) | Jun 30 |
| 1+ practitioner logs into dashboard weekly unprompted | Dashboard analytics | Jun 30 |

### Objective 3: Legal and Operational Foundations

| Key Result | Target | By |
|------------|--------|-----|
| Privacy policy reviewed by PIPEDA lawyer | Legal sign-off | Apr 30 |
| Supabase data residency confirmed compliant | Infrastructure doc | Apr 15 |
| V-Health pilot agreement signed with pricing terms | Signed agreement | Apr 15 |

---

## Q3 2026 OKRs (July — September)

### Objective 1: Convert to Paying and Prove Unit Economics

| Key Result | Target | By |
|------------|--------|-----|
| V-Health paying monthly subscription | First invoice paid | Jul 1 |
| Monthly AI + SMS cost per active patient below $3 | Cost dashboard | Sep 30 |
| Patient retention (still logging after 8+ weeks) above 40% | Cohort analysis | Sep 30 |

### Objective 2: Ship Active Features Based on Pilot Learnings

| Key Result | Target | By |
|------------|--------|-----|
| Pattern detection live and delivering insights | Insight messages sent | Jul 31 |
| White-label branding for V-Health (custom domain live) | vhealth.ai fully branded | Aug 31 |
| Bilingual safety testing complete (50+ CN adversarial tests) | Test suite passing | Jul 15 |

### Objective 3: Begin Clinic Expansion

| Key Result | Target | By |
|------------|--------|-----|
| Publish V-Health case study with real metrics | Case study live | Aug 15 |
| Outreach to 20 clinics in Greater Vancouver | Outreach tracker | Sep 30 |
| Sign 2 additional clinics to paid pilots | Signed agreements | Sep 30 |

---

## Roadmap with Dates

| Milestone | Date | Gate |
|-----------|------|------|
| Legal ready + pilot agreement signed | Apr 15 | Lawyer sign-off |
| V1 internal alpha (founder testing) | Apr 30 | Full SMS + web loop working |
| V1 beta at V-Health (first 5 patients) | May 15 | First patient message received |
| V1 full rollout (20 patients) | Jun 15 | 20 enrolled |
| **Validation gate** | Jun 30 | 40%+ logging rate, practitioner satisfaction |
| V-Health billing starts | Jul 1 | First invoice |
| Active features (patterns, nudges mature) | Jul 31 | Data-driven insights delivered |
| Case study published | Aug 15 | Published with anonymized data |
| Clinic #2 and #3 signed | Sep 30 | Signed agreements |
| V2 planning kickoff | Oct 1 | Only if 3 paying clinics |

---

## Top 3 Risks

### 1. Patients Stop Logging After Week 2 (Critical)
**Mitigation:** Logging must take <15 seconds. AI initiates check-ins in first 2 weeks. Inactivity nudges at 3 days. Track drop-off daily. If <30% at week 4, treat as product crisis.

### 2. Regulatory / Privacy Incident (High)
**Mitigation:** PIPEDA lawyer before launch ($3-5K). Consent flow in onboarding. Human review of 10% of AI conversations weekly. Incident response plan documented.

### 3. Single-Customer Dependency (Medium-High)
**Mitigation:** Track Lisa-persona (typical patient) vs Jason-persona (power user) separately. Patient interviews at week 4. Begin clinic outreach by month 3 regardless of pilot data perfection.

---

## Sign-Off Conditions

1. V1 scope as agreed (core loop + weekly report + nudges by Sprint 4)
2. Legal before launch — no patient data collected without consent flow and privacy policy
3. 60-day billing trigger communicated to V-Health on day 1
4. Weekly founder check-in: patient count, logging rate, safety flags, dashboard logins
5. June 30 validation gate — if <40% logging rate, pause features and diagnose
6. No V2 planning until 3 paying clinics
