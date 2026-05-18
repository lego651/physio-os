# V-Health Owner — Pain Points & Local Service Owner Persona

> **Anchor user:** David Wang, owner-operator of V-Health Rehab Clinic, Calgary.
> **Source:** in-person conversation 2026-05-05 (`docs/strategy/v-health-pain-points.md` after migration; currently `life-os/Projects/physio-os/draft-requirements.md`) + founder notes from `docs/v0-demo-plan.md` § "What the Owner Cares About".
> **Owner of this doc:** `physio-david` agent. Updated when David Wang gives new info or when data shifts weighting.
> **Status:** Living document. Last calibration: 2026-05-15.

This is two things in one file:

1. **What V-Health's owner actually said is broken** — captured faithfully, including the bits where his perception is probably wrong.
2. **Our typical user persona for the cross-clinic SaaS thesis** — clinic #2 will be a person who looks demographically and operationally like David Wang. His pain list IS our customer-research summary.

---

## Driving rule — we don't blindly follow the owner

David Wang's stated urgency ≠ our build priority. We weight by three filters before anything ships:

1. **Does this pain map to one of his two strategic goals (G1 / G2)?** If not — defer.
2. **Can we commit to an observable data check in ≤30 days?** If not — the feature is theatre.
3. **Does clinic #2 have this exact pain?** If yes → high productization priority. If no → V-Health-only relationship currency, not SaaS.

**All in-build features must define a data success criterion BEFORE code starts.** No exceptions.

---

## The two strategic goals (verbatim from owner)

Everything rolls up to exactly these two. A feature that doesn't trace to G1 or G2 doesn't ship in 2026.

| #      | Goal                                                                                                          | Source                                                |
| ------ | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| **G1** | More bookings spread to **other therapists** (he has enough business himself; the other 11 staff need volume) | `docs/v0-demo-plan.md` § "What the Owner Cares About" |
| **G2** | More **Google reviews** (existing QR at front desk converts poorly)                                           | `docs/v0-demo-plan.md` § "What the Owner Cares About" |

---

## Pain points — sorted by OUR weight (not his urgency)

11 specific tactical pains David Wang raised on 2026-05-05.

**Column legend:**

- **Maps to** = which strategic goal (G1 / G2)
- **His urgency** = how strongly HE raised it (HIGH = led with it; MED = raised in conversation; LOW = answered only when asked)
- **Our weight** = HIGH / MED / LOW after applying the three filters above
- **Generalizes** = does this same pain exist at every other local service business? (YES / TRAFFIC-GATED / COHORT / NO)
- **Status** = OPEN / SPEC'D / PARTIALLY BUILT / BUILT / DEFERRED / KILLED

| Rank   | ID      | Category     | David's pain (his words, paraphrased)                                                                                                                            | Maps to                                    | His urgency                | **Our weight**             | Generalizes                                       | Status                                                                                                                                                           | Why this rank                                                                                                                                                            |
| ------ | ------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | -------------------------- | -------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **1**  | **P01** | Marketing    | "Make short-form clips out of my long footage — Instagram / Facebook / YouTube Shorts. I have zero video-editing experience and don't know where to start." (1A) | G1                                         | **HIGH** (his #1)          | **HIGH**                   | YES — every local biz                             | OPEN                                                                                                                                                             | Owner's verbatim #1, fully aligned with G1, universally generalizable. Cross-clinic SaaS gold.                                                                           |
| **2**  | **P10** | Reviews      | "AI helps the patient write a Google review in seconds instead of staring at an empty box." (5A)                                                                 | G2                                         | MED-HIGH                   | **HIGH**                   | YES — every local biz                             | PARTIALLY BUILT (Widget V1 infra + Resend reusable)                                                                                                              | Direct hit on G2. Already half-built. Data signal (review count) is unambiguous.                                                                                         |
| **3**  | **P11** | Reviews      | "Post-visit SMS reminder with a pre-drafted review link — patients intend to review but forget." (5B)                                                            | G2                                         | MED-HIGH                   | **HIGH**                   | YES — every local biz that collects phone numbers | DEFERRED to Phase 2 (CASL consent gate, founder-accepted for V-Health pilot only)                                                                                | Same as P10 but for the 60% of patients who don't review on-site. CASL adds friction but the pain is universal.                                                          |
| **4**  | **P08** | Internal ops | "100 patient profiles I haven't entered because the intake form is too slow. I want to dictate." (3)                                                             | G1 (indirect — capacity for more bookings) | HIGH (verbalized strongly) | **MED**                    | YES — every clinic                                | SPEC'D (vault Mile 1 locked), NOT BUILT                                                                                                                          | Solves the owner's stated pain → strong relationship currency. But doesn't grow customers directly. Build as trust-investment, not as core SaaS lead.                    |
| **5**  | **P06** | Booking      | "Floating chat / booking widget on site so visitors can ask questions and book directly." (2)                                                                    | G1                                         | MED                        | **MED** (gated by traffic) | TRAFFIC-GATED                                     | BUILT (Widget V1 done, NOT deployed)                                                                                                                             | Code exists. Jason's 2026-05-15 calibration: V-Health site traffic is small → widget usage will be small → signal is weak. Deploy cheaply, measure 30 days, then decide. |
| **6**  | **P05** | Marketing    | "Reach beyond the Chinese word-of-mouth network to broader Calgary." (1E)                                                                                        | G1                                         | MED                        | **MED**                    | COHORT (immigrant-owned local biz)                | OPEN, no proposal yet                                                                                                                                            | Real pain, smaller addressable market. Likely a positioning + content play, not a build.                                                                                 |
| **7**  | **P07** | Booking      | "Promo banner — like '10% off first visit' — to drive widget clicks." (2B)                                                                                       | G1                                         | LOW (raised when prompted) | **LOW**                    | TRAFFIC-GATED                                     | KILLED for V1 (JG attribution widget — Jason verbatim 2026-05-05: "adding banner now doesn't add anything, you didn't analyze what is current site traffic yet") | Gated on site traffic data which we don't have. Theatre without it.                                                                                                      |
| **8**  | **P03** | Marketing    | "Google Ads at $500/mo isn't producing satisfying results." (1C)                                                                                                 | G1                                         | MED                        | **LOW**                    | YES                                               | DEFERRED — partner play, not a build (needs Ads account access + liability)                                                                                      | We're not buying Ads liability. If the owner gives us account access we audit and suggest. No SaaS module here.                                                          |
| **9**  | **P02** | Marketing    | "Smart posting schedule — space out posts intentionally, not spammy." (1B)                                                                                       | G1                                         | LOW (raised in passing)    | **LOW**                    | YES — bundles into P01                            | DEFERRED (depends on P01)                                                                                                                                        | Bundles into the video pipeline. Don't build separately.                                                                                                                 |
| **10** | **P09** | Hiring       | "No process for recruiting more contractor therapists — don't know where to post." (4)                                                                           | G1 (capacity)                              | LOW                        | **LOW**                    | COHORT (only multi-staff biz)                     | DEFERRED                                                                                                                                                         | Adds therapist supply → more bookable capacity. Real but slow ROI; defer to post-clinic-#2.                                                                              |
| **11** | **P04** | Marketing    | "No SEO visibility on Wix — don't know how I rank." (1D)                                                                                                         | G1                                         | LOW                        | **LOW**                    | YES but slow signal                               | DEFERRED                                                                                                                                                         | SEO is a 6–12-month payoff. Not the lever for 2026.                                                                                                                      |

---

## Jason's 2026-05-15 calibration (additions beyond David Wang's stated pains)

### Chat widget priority — DOWN

Widget V1 code is complete (`feat/chatbot-widget-v1`, 26 commits, 42 files) but **deployment is now gated by a data hypothesis check**. V-Health's site traffic is small → widget usage will be small → signal will be weak. We deploy it (cheap — code is already done) but we **do not invest more in widget itself until 30 days of conversation data tells us whether it's worth productizing.**

### Virtual Coach (proactive patient push) — V2 candidate

**Jason's hypothesis:** A coach pushed proactively to each existing patient (David Wang sends it; patients use it because they're already engaged) gets higher usage than a chat widget (random site visitors).

This is the **resurrection path for the paused original V1 patient-coaching product** (`apps/web/app/(patient)/chat/` + `/api/chat/` + Sprints 1–2 already complete). The infrastructure exists. The trigger that was missing — "how do patients find out about it?" — gets answered by David pushing it directly.

**Status:** V2 hypothesis. Not in Phase 1. Surface at Phase 2 ELT review as a candidate alongside the review engine. **Data check before any restart:** define "what does a successful coach pilot look like at 30 patients?" (target: ≥40% weekly logging rate).

---

## Cross-clinic generalizability — the SaaS thesis filter

For each pain point we ask: **would clinic #2 have this exact same pain?** That answer is what makes a pain $99/mo × N clinics worth.

| Generalization                                  | Pain points                                     | SaaS implication                                      |
| ----------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------- |
| **Universal** (every local biz)                 | P01 video, P10 in-clinic review, P11 SMS review | Highest priority for productization                   |
| **Universal but traffic-gated**                 | P06 chat widget, P07 promo banner               | Productize only at clinics with measured site traffic |
| **Universal but channel-gated**                 | P03 Ads, P04 SEO                                | Partner play, not a direct build                      |
| **Cohort-specific** (immigrant-owned biz)       | P05 reach beyond own community                  | Real market but narrower segment                      |
| **Cohort-specific** (multi-staff biz)           | P09 recruiting                                  | Smaller addressable market                            |
| **Operational** (internal, not customer-facing) | P08 voice intake                                | Sells as upsell, not lead module                      |

---

## V-Health — anchor case study facts

| Field               | Value                                                                                                      |
| ------------------- | ---------------------------------------------------------------------------------------------------------- |
| Owner               | David Wang (referred to as "V-Health 的 David" or "David Wang" in docs — distinct from `@David` the agent) |
| Address             | #110 & #216, 5403 Crowchild Trail NW, Calgary, AB T3B 4Z1                                                  |
| Phone               | 403-966-6386                                                                                               |
| Email               | vhealthc@gmail.com                                                                                         |
| Website             | https://www.vhealth.ca/                                                                                    |
| Booking             | https://vhealthc.janeapp.com (JaneApp)                                                                     |
| Hours               | Mon–Fri 9:30am–8:30pm · Sat–Sun 9:30am–6pm                                                                 |
| Services            | Massage (RMT) · Osteopathic (OMT) · Acupuncture (TCM)                                                      |
| Staff               | 12 therapists (real names seeded in `supabase/migrations/013_widget_vhealth_seed.sql`)                     |
| Volume              | ~1,200 patient-sessions/month (CFO estimate)                                                               |
| Patient pool        | predominantly Chinese-Canadian, word-of-mouth driven                                                       |
| Marketing           | $500/mo Google Ads (unsatisfying results per owner); no organic social presence                            |
| Communication style | Non-technical, wants to be led ("the owner wants us to LEAD, not ask")                                     |

---

## How this doc is used

- **Before scoping any feature:** check which pain it solves and what its data check is. Both must be filled in before code starts.
- **At each ELT review:** revisit the weighting. Has any pain moved? Has data invalidated any assumption?
- **When David Wang gives new info:** David (the agent) updates this file within 24h and flags the change in conversation.
- **When pitching clinic #2:** lead with P01 (video) + P10/P11 (reviews) — the universal pains. These are the SKU door-openers.

---

_Owner: `physio-david` (agent). Manager: `manager-mathieu` (Product & Engineering Director). Last updated 2026-05-15._
