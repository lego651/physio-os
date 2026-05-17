# Motivation — Why We're Doing This

> **Owner:** Jason Gao. Written by physio-david agent. Source: Jason's 5 answers, 2026-05-16.
> This file supersedes any "north star" framing in vault docs or earlier agent specs that positioned V-Health as a strategic partner.

---

## TL;DR

Jason wants to make money with AI by serving Calgary-area local businesses — copy models already validated in other cities, not invent new ones. V-Health is a zero-cost, 1–2 month test case that happens to be available now. If the data supports traction, keep going. If not, stop.

**Operating posture: AI consulting firm.** Jason is not David Wang's friend doing favors. He is a professional vendor: deploy, measure, invoice on results. Every engagement has a SOW, a single success metric, and a 30–60 day proof window. Everything built for V-Health must be sellable to clinic #2 in under 20 minutes.

---

## North Star

**Target:** $1M ARR delivering AI advisory + SaaS services to local Calgary service businesses.

This is not a product vision statement — it is a personal income target. The path is:
1. Find 3 already-validated AI-for-local-business playbooks (other cities).
2. Run them on V-Health, measure results in ≤60 days.
3. If at least 1 shows traction, package and sell to clinic #2 and beyond at $99/mo or similar.
4. Repeat until $1M ARR.

No "innovative AI" required. No new category creation. Speed and execution over originality.

---

## Strategic Posture

- **Copy, don't invent.** Other cities have already validated what works for local physio/massage/health clinics. Our job is market intelligence first, local execution second.
- **V-Health is a test case, not a strategic partner.** The relationship is useful — David Wang trusts Jason, is non-technical, and gives full decision autonomy. But this is not a long-term strategic partnership. It is a 1–2 month experiment.
- **Data-driven exit.** We pick 3 cut-in points, deploy, track results. If results are poor, we stop. No follow-up, no sunk-cost extension.
- **Zero-extra-cost constraint.** The experiment runs at near-zero marginal cost. Do not propose solutions that require new paid infrastructure, significant build time, or long-term commitments before traction is confirmed.

---

## Why V-Health, Why Now

- Personal relationship: David Wang trusts Jason as an "AI expert" and will follow his lead.
- Timing: no better test case available right now, and the window is short (~1–2 months).
- Cost: zero incremental cost — existing repo, existing relationship, no contract to sign.
- Autonomy: David Wang is a technical layperson. Jason has full product decision authority.
- Risk: if it fails, the downside is 1–2 months of time, not money or reputation.

---

## Constraints and Non-Goals

| Constraint | What it means in practice |
|---|---|
| Not doing this for V-Health's benefit | We can and should reject "owner-stated" pain points that don't map to real data |
| Not doing this to build a portfolio or de-risk a career change | Don't over-engineer; don't optimize for impressiveness |
| Not innovating | Don't build novel AI systems; copy playbooks that already work elsewhere |
| Not committed to V-Health long-term | Do not architect for a 3-year V-Health roadmap; architect for "clinic #2 in 20 minutes" |
| 60-day experiment window | Do not scope anything that takes >4 weeks to get to measurable results |

---

## Success and Stop Conditions

**Continue if:** at least 1 of the 3 cut-in points shows observable traction within 60 days (e.g., measurable bookings increase, Google review count delta, or lead capture that converts to a real appointment).

**Stop if:** all 3 cut-in points show no measurable signal after full deployment and observation period.

**Stop-loss window:** ~2 months from first deploy. No extensions without new data.

**What "traction" means (to be defined per cut-in point — see Open Questions):** a number Jason can show to a prospective clinic #2 owner and get a "that's interesting, tell me more."

---

## Open Questions (to resolve in next session)

1. **Which 3 cut-in points?** (Core decision — next discussion topic.)
2. **Which cities / which existing playbooks are we copying?** (Need market intelligence pass before scoping builds.)
3. **$1M ARR decomposition:** How many clients at what ARPU? E.g., 1,000 clinics × $1,000/yr vs. 200 clinics × $5,000/yr — affects which SKU to lead with.
4. **What does "traction" mean numerically for each cut-in point?** (Must be defined before deploying, not after.)
5. **April 30 V-Health demo outcome** — did the chatbot work on David Wang's iPhone? What did he ask for next? (Still unconfirmed — affects whether widget V1 counts as a deployed cut-in point.)

---

---

## Operating Model — AI Consulting Posture

This section is not philosophy — it is operational. Every physio-os decision filters through it.

**1. Identity: vendor, not friend.**
Jason is not helping David Wang as a favor. He is a professional AI consulting firm taking on a client engagement. That means: formal discovery, written SOW with success metrics, clean deliverables, and an invoice triggered by results — not by time spent. The relationship is warm but the engagement structure is professional.

**2. Payment model: success-based.**
No upfront fee, no retainer at V-Health (Year 1 is the proof-of-concept investment). Payment is triggered by observable results — 5% on JG-attributed bookings is the prototype. This constraint is a forcing function: only cut-in points with results measurable in 30–60 days are eligible. If we can't show David Wang a number in that window, it's the wrong project.

**3. Productization requirement.**
Everything we do for V-Health must be a template, not a custom job. "Can this be deployed at clinic #2 in under 20 minutes?" is the gate question before any build starts. If the answer is no, we either make it generalizable or we don't build it.

**4. Right to push back.**
A consulting firm's job is to reject a client's wrong diagnosis. When David Wang says "I need X", our job is to ask "does X move the number we agreed to move?" If not, we push back. This is not rudeness — it is the professional role.

**5. Engagement rhythm.**
Discovery → audit (baseline numbers) → SOW with single success metric per service → deploy → measure → invoice on results. Skip any step and the engagement loses credibility. The discovery meeting agenda (see Jason's planning notes) is the entry point to this rhythm.

---

*Last updated: 2026-05-16. Source: Jason direct answers to physio-david Q1–Q5. Consulting posture added 2026-05-16.*
