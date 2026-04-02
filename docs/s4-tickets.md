# Sprint 4 — Engineering Tickets

> Sprint goal: System-initiated features — weekly reports, inactivity nudges, pattern detection, SMS cost tracking.
> Deliverable: Weekly report pages with charts. Patients receive nudges when inactive. AI detects recovery patterns. Admin sees SMS spend.
> Total: 29 points across 10 tickets.

---

### S401 — Weekly report generation via AI
**Type:** AI/backend
**Points:** 5
**Depends on:** S306, S307

**Goal:** AI generates a weekly narrative summary with structured metrics, trends, and insights for each patient.

**Scope:**
- Create `packages/ai-core/src/tools/generate-report.ts`:
  - `generateWeeklyReport(patientId, weekStart, supabase)` function
  - Loads: all metrics for the week, all messages for the week, patient profile
  - Calls Claude with a report-generation prompt:
    - "Summarize this patient's recovery progress for the week. Include: overall trend, key metrics, notable patterns, encouragement."
    - Returns structured output:
      ```typescript
      {
        summary: string          // 2-3 sentence narrative
        metricsSummary: {
          avgPain: number | null
          avgDiscomfort: number | null
          avgSittingTolerance: number | null
          exerciseDays: number
          totalDays: 7
          painTrend: 'improving' | 'stable' | 'worsening'
          discomfortTrend: 'improving' | 'stable' | 'worsening'
        }
        insights: string[]        // pattern observations
      }
      ```
  - Compare with previous week's metrics for trend calculation
  - Store in `reports` table with signed JWT token for URL access
  - JWT includes `exp` claim set to 7 days from generation, signed with `REPORT_TOKEN_SECRET` env var
- Report language: match patient's language preference (summary in EN or CN)

**Edge cases:**
- Patient has < 3 data points this week → generate report with available data + note "limited data"
- Patient has 0 data points → skip report generation for this patient
- Previous week has no report → can't calculate trends, show "first week" baseline
- AI generates summary longer than expected → truncate to 500 chars

**Acceptance criteria:**
1. Report generated with narrative summary + structured metrics
2. Trends calculated by comparing to previous week
3. Insights array contains at least 1 observation (or empty if insufficient data)
4. Report stored in DB with unique signed JWT token
5. Patient with 0 data points → no report generated
6. Report in patient's preferred language
7. Unit test: mock data → verify correct averages and trends

**Out of scope:**
- Report delivery (S403 — SMS)
- Report web page (S402)
- Cross-patient reports (V2)

---

### S402 — Weekly report web page (mobile-first)
**Type:** frontend
**Points:** 5
**Depends on:** S401

**Goal:** Mobile-friendly web page showing the weekly report with charts and insights. Accessed via signed URL from SMS.

**Scope:**
- Route: `apps/web/app/report/[token]/page.tsx`
  - Server component: verify JWT token, load report from DB
  - Invalid/expired token → friendly 404: "This report has expired. Open your chat to see your progress."
- Page layout (per UI guide — Weekly Progress Report section):
  - Header: V-Health logo + "Weekly Recovery Report" + date range
  - Greeting: "Hi {name},"
  - Metric cards (large numbers, monospace font):
    - Pain: average + trend arrow (red spectrum)
    - Discomfort: average + trend arrow (amber spectrum)
    - Sitting tolerance: average + trend (teal)
  - Exercise completion: progress bar (X/7 days, green)
  - Chart: 7-day line chart showing discomfort over time (Recharts)
    - X-axis: days of week
    - Y-axis: discomfort 0-3
    - Line color: `#F59E0B` (amber)
  - Insights section: bullet points from `reports.insights`
  - CTA button: "Open Chat →" linking to `/chat`
- No authentication required (signed token is the auth)
- Token expiry: 7 days
- Mobile-optimized: designed for 375px viewport, scroll-based layout, no horizontal overflow

**Edge cases:**
- Expired token (>7 days) → graceful error page with link to chat
- Report with no pain data → hide pain card (don't show "N/A")
- Report with only 1 data point → show single point on chart, note "limited data"
- Chart with all identical values → still renders (flat line is valid)

**Acceptance criteria:**
1. Valid token → report page renders with correct patient data
2. Expired token → friendly error page
3. Metric cards show correct averages with trend arrows
4. Exercise progress bar shows X/7
5. Recharts line chart renders 7-day discomfort trend
6. Insights listed as bullet points
7. "Open Chat" CTA links to `/chat`
8. Page loads under 2 seconds
9. Mobile-responsive at 375px with no horizontal scroll
10. WCAG AA contrast on all text

**Out of scope:**
- PDF export (V2)
- Sharing reports with practitioners via dashboard (S5 — linked from patient detail)
- Historical report comparison

---

### S403 — Weekly report SMS delivery via Vercel Cron
**Type:** backend
**Points:** 2
**Depends on:** S401, S402, S303

**Goal:** Every Sunday at 9am PST, generate reports for all active patients and send a short SMS with link.

**Scope:**
- Create Vercel Cron endpoint: `apps/web/app/api/cron/weekly-report/route.ts`
  - Verify `CRON_SECRET` header (Vercel Cron sets this automatically)
  - Query all active, non-opted-out patients with at least 1 metric this week
  - For each patient: call `generateWeeklyReport()` (S401)
  - Send SMS: "Hi {name}, your weekly recovery report is ready! Your discomfort averaged {avg}. View details: {url}"
  - SMS must be under 160 chars (1 segment) — the URL + short summary
- `vercel.json` cron config:
  ```json
  { "crons": [{ "path": "/api/cron/weekly-report", "schedule": "0 17 * * 0" }] }
  ```
  (17:00 UTC = 9:00 AM PST / 10:00 AM PDT)
- Short URL: use the report token URL directly (it's already short enough)

**Edge cases:**
- Patient with 0 metrics this week → skip (no report generated, no SMS sent)
- Patient opted out → skip
- Twilio send failure → log error, continue to next patient (don't stop batch)
- Cron runs but no patients qualify → complete silently
- Sunday morning: some patients may have only 1-2 days of data if they started mid-week → still generate report

**Acceptance criteria:**
1. Cron endpoint requires `CRON_SECRET` header
2. Reports generated only for patients with data
3. SMS sent with summary + link (under 160 chars)
4. Opted-out patients skipped
5. Twilio failure for one patient doesn't block others
6. `vercel.json` contains correct cron config
7. Manual trigger via `curl` works for testing

**Out of scope:**
- Custom schedule per patient (V2)
- Email delivery (V2)

---

### S404 — Inactivity nudge: daily cron for 3+ day inactive patients
**Type:** backend
**Points:** 3
**Depends on:** S303, S207

**Goal:** Patients who haven't messaged in 3+ days get a gentle, personalized SMS nudge.

**Scope:**
- Create Vercel Cron endpoint: `apps/web/app/api/cron/nudge/route.ts`
  - Verify `CRON_SECRET`
  - Query: patients where `last message > 3 days ago` AND `active = true` AND `opted_out = false` AND `consent_at IS NOT NULL`
  - For each eligible patient:
    - Check: haven't been nudged in this inactive period (prevent daily spam). Track via a `last_nudged_at` field on `patients` table (add migration).
    - Generate personalized nudge via Claude: "Generate a brief, warm check-in message for {name} who has {condition}. Last known discomfort was {last_discomfort}. Keep under 160 characters."
    - Send via Twilio
    - Update `last_nudged_at`
  - Limit: max 1 nudge per inactive period (until patient responds, resetting the clock)
- `vercel.json` cron: `"0 18 * * *"` (18:00 UTC = 10:00 AM PST)
- Create migration file `supabase/migrations/004_add_nudge_column.sql`:
  ```sql
  ALTER TABLE patients ADD COLUMN last_nudged_at timestamptz;
  ```
- Verify `supabase db reset` succeeds with the new column

**Edge cases:**
- Patient just responded yesterday → not inactive, skip
- Patient nudged 2 days ago and still hasn't responded → don't nudge again (1 per period)
- Patient responds after nudge → `last_nudged_at` doesn't reset automatically; the 3-day inactivity timer resets because there's a new message
- Patient with no messages ever (new signup who never logged) → nudge after 3 days
- Claude generates nudge > 160 chars → truncate

**Acceptance criteria:**
1. Patients inactive 3+ days get a nudge SMS
2. Max 1 nudge per inactive period
3. Opted-out patients never nudged
4. Nudge is personalized (uses patient name + condition)
5. Nudge under 160 characters
6. Patient responds → next nudge only after another 3-day gap
7. `last_nudged_at` updated after nudge sent

**Out of scope:**
- Configurable inactivity threshold (hardcode 3 days for V1)
- Email nudges (V2)
- Nudge frequency settings per patient (V2)

---

### S405 — Pattern detection: analyze metrics for correlations
**Type:** AI
**Points:** 5
**Depends on:** S401

**Goal:** During weekly report generation, AI analyzes 2+ weeks of data to find recovery patterns and correlations.

**Scope:**
- Extend `generateWeeklyReport()` (S401) with pattern analysis:
  - If patient has 14+ days of data, include pattern detection in the report prompt
  - Pattern prompt: "Analyze the following daily metrics and look for correlations:
    - Do days with exercises correlate with lower discomfort the next day?
    - Do missed stretching days correlate with higher discomfort the next day?
    - Is there a trend in sitting tolerance over time?
    - Any other notable patterns?"
  - Store detected patterns in `reports.insights` array
  - Surface insights in weekly report (S402) and admin dashboard (S5)
- Insight format: actionable, patient-friendly language
  - Good: "Your discomfort tends to be lower on days after you do your stretches."
  - Bad: "Correlation coefficient between exercise and discomfort: -0.45"

**Edge cases:**
- < 14 days of data → skip pattern detection, only basic summary
- All metrics identical → "Your metrics have been stable this week."
- Clear correlation found → present as observation, not prescription: "We notice..." not "You should..."
- Spurious correlation (e.g., pain lower on weekends due to rest, not exercise) → AI should caveat: "This might be due to..."

**Acceptance criteria:**
1. Patients with 14+ days of data get pattern analysis
2. Patients with < 14 days get basic summary only
3. Insights are in patient-friendly language
4. Insights do not prescribe actions (observe only)
5. Insights stored in `reports.insights` array
6. At least 1 correlation type checked (exercise vs. next-day discomfort)
7. Edge case: stable metrics → appropriate "stable" insight

**Out of scope:**
- Statistical modeling (V2 — for now, Claude's judgment is sufficient)
- Cross-patient pattern analysis (V2)

---

### S406 — Conversational progress query: "how am I doing?"
**Type:** AI
**Points:** 2
**Depends on:** S307

**Goal:** When a patient asks about their progress, AI uses `get_history` tool to provide a data-backed answer.

**Scope:**
- System prompt update (S202): add instruction:
  - "When the patient asks about their progress, how they're doing, or requests a summary, use the `get_history` tool to retrieve their recent metrics before responding."
  - "Present the data conversationally: 'Over the past week, your average discomfort was 1.8, down from 2.1 the week before. You completed exercises 5 out of 7 days. Keep it up!'"
- No code changes needed beyond prompt update — the tool (S307) already exists
- Test with various phrasings: "how am I doing?", "am I getting better?", "show me my progress", "这周怎么样？"

**Acceptance criteria:**
1. "How am I doing?" → AI calls `get_history` and responds with data
2. "Am I getting better?" → same behavior
3. Chinese equivalent → same behavior in Chinese
4. Response includes specific numbers (averages, trends)
5. New patient with no data → "We don't have enough data yet. Let's start tracking!"

**Out of scope:**
- Rendering charts in chat (web report handles visualization)

---

### S407 — Vercel Cron configuration
**Type:** setup
**Points:** 1
**Depends on:** S403, S404

**Goal:** Configure all cron jobs in `vercel.json`.

**Scope:**
- Update `vercel.json`:
  ```json
  {
    "crons": [
      { "path": "/api/cron/weekly-report", "schedule": "0 17 * * 0" },
      { "path": "/api/cron/nudge", "schedule": "0 18 * * *" }
    ]
  }
  ```
- Set `CRON_SECRET` env var in Vercel (auto-set by Vercel for cron routes)
- Both cron endpoints: verify `Authorization: Bearer ${CRON_SECRET}` header
- Document: how to manually trigger crons for testing (curl with auth header)

**Acceptance criteria:**
1. `vercel.json` contains both cron entries
2. Cron endpoints reject requests without valid secret
3. Manual trigger via curl works
4. Documentation on testing crons

---

### S408 — SMS cost tracking
**Type:** backend
**Points:** 2
**Depends on:** S303

**Goal:** Track SMS segment usage and alert admin when approaching $50 budget.

**Scope:**
- Create utility `apps/web/lib/sms/cost-tracker.ts`:
  - After each SMS send, increment a counter: `sms_segments:{YYYY-MM}` in DB or simple table
  - Create small table: `sms_usage(month text PK, segments int, cost_estimate decimal)`
  - Cost estimate: segments * $0.0079 (Twilio Canada rate for outbound SMS)
  - Inbound SMS are free on Twilio
- Admin API endpoint: `GET /api/admin/sms-usage` → returns current month usage
- In daily nudge cron (S404): after processing, check month-to-date cost. If > $40, send alert email to `ADMIN_EMAIL` (simple `fetch` to a mail endpoint, or inline for V1)
- Dashboard display (S5): show current month SMS cost in settings or overview

**Edge cases:**
- Chinese/Unicode messages use UCS-2 → 70 chars per segment vs 160. Track actual segments, not message count.
- Twilio provides segment count in API response → use that instead of estimating
- Month rollover: new counter starts automatically with `{YYYY-MM}` key

**Acceptance criteria:**
1. Each outbound SMS increments the monthly counter
2. Cost estimate calculated from actual segment count
3. Admin endpoint returns current month usage
4. Alert triggered when cost exceeds $40
5. Month rollover handled correctly

**Out of scope:**
- Twilio usage API integration (approximation is fine for V1)
- Per-patient cost tracking (V2)

---

### S409 — Report page "Open Chat" CTA
**Type:** frontend
**Points:** 1
**Depends on:** S402

**Goal:** Report page includes a clear call-to-action to open the web chat.

**Scope:**
- At bottom of report page: shadcn `Button` "Open Chat →" linking to `/chat`
- If patient is not authenticated on web → button links to `/login` with redirect back to `/chat`
- Button style: primary, full-width on mobile

**Acceptance criteria:**
1. Button visible at bottom of report page
2. Click → navigates to `/chat` or `/login` → `/chat`
3. Full-width on mobile
4. Follows UI guide button styles

---

### S410 — Tests: reports, crons, nudges, patterns
**Type:** testing
**Points:** 3
**Depends on:** S401-S408

**Goal:** Automated tests for Sprint 4 features.

**Scope:**
- Report generation: mock metrics → verify averages, trends, insights structure
- Cron auth: missing secret → 401, valid secret → 200
- Nudge logic: inactive 3 days → eligible, inactive 2 days → not eligible, already nudged → not eligible
- Pattern detection: sufficient data → insights generated, insufficient → skipped
- SMS cost tracker: increment, month rollover, alert threshold
- Report token: valid → renders, expired → error page

**Acceptance criteria:**
1. `pnpm test` passes all Sprint 4 tests
2. 20+ test cases
3. Cron auth tested
4. Nudge eligibility logic has 5+ edge case tests
