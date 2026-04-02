# Sprint 5 — Engineering Tickets

> Sprint goal: Admin dashboard fully functional — patient list, detail views, metrics charts, alerts, patient management.
> Deliverable: Admin sees all patients with status, drills into detail with charts and conversation logs, manages patients, gets alert badges.
> Total: 29 points across 11 tickets.

---

### S501 — Patient list page with status badges
**Type:** frontend
**Points:** 3
**Depends on:** S109 (dashboard shell), S104

**Goal:** Admin sees all enrolled patients with key metrics and status at a glance.

**Scope:**
- Route: `apps/web/app/(clinic)/dashboard/patients/page.tsx`
- Server component: query all patients with aggregated data
- Patient card (per row):
  - Name + language badge (EN/CN)
  - Last activity: relative time ("2 hours ago", "5 days ago")
  - Most recent discomfort score (number + color: green 0-1, amber 2, red 3)
  - Most recent pain score (number + color based on severity)
  - Exercise days this week: "4/7" with mini progress indicator
- Status badges:
  - **Active** (green): messaged within last 3 days
  - **Inactive** (amber): no messages in 5+ days
  - **Alert** (red): most recent pain is 2+ above their 7-day average
  - **New** (blue): enrolled within last 7 days
- Sorting: default by last activity (most recent first). Toggle: alphabetical, status
- Search: filter by patient name (client-side for V1 with 30 patients)
- Click row → navigate to `/dashboard/patients/[id]`

**Edge cases:**
- Patient with no messages → show "No activity yet" + "New" badge
- Patient with no metrics → show dashes for metric values
- 0 patients → empty state: "No patients enrolled yet. Add a patient to get started."
- Pain/discomfort averages should handle null values (skip nulls)

**Acceptance criteria:**
1. All patients displayed with correct data
2. Status badges render with correct colors
3. Click patient → navigates to detail page
4. Search filters by name
5. Sort toggles work
6. Empty state shows when no patients
7. Loads under 3 seconds with 30 patients
8. Responsive: cards stack on mobile

**Out of scope:**
- Pagination (30 patients don't need it)
- Bulk actions on patients

---

### S502 — Patient detail: profile + metric history chart
**Type:** frontend
**Points:** 5
**Depends on:** S501, S104

**Goal:** Practitioner sees a patient's full recovery data with charts.

**Scope:**
- Route: `apps/web/app/(clinic)/dashboard/patients/[id]/page.tsx`
- Layout sections:
  1. **Profile card:** Name, language, condition, practitioner (if assigned), enrolled date, active status
  2. **Metric overview cards** (current week):
     - Average pain (large monospace number, red)
     - Average discomfort (large monospace number, amber)
     - Average sitting tolerance (large monospace number, teal)
     - Exercise completion (X/7, green progress bar)
  3. **Trend chart** (Recharts):
     - Dual-axis line chart: discomfort (amber) + pain (red) over time
     - X-axis: dates (last 30 days default)
     - Y-axis left: discomfort 0-3
     - Y-axis right: pain 0-10
     - Date range selector: 7 days / 14 days / 30 days / All time
  4. **Metrics table:**
     - Columns: Date, Pain, Discomfort, Sitting Tolerance, Exercises, Notes
     - Sorted most recent first
     - Scrollable, max 20 rows visible (load more)
- Data fetching: server component with Supabase service role (admin access)

**Edge cases:**
- New patient: no metrics → show empty chart with "Waiting for first check-in" message
- Single data point → show as dot on chart, not line
- Missing metric fields → show dash in table cell
- Very long exercise names → truncate with tooltip

**Acceptance criteria:**
1. Profile card shows correct patient info
2. Metric overview cards show correct current-week averages
3. Recharts chart renders with correct dual-axis data
4. Date range selector updates chart
5. Metrics table shows all recorded metrics
6. Empty state for new patients
7. Loads under 2 seconds
8. Mobile: chart scales down, table scrolls horizontally

**Out of scope:**
- Editing patient profile (S507)
- Conversation log (S503)
- Weekly reports (S504)

---

### S503 — Patient detail: conversation log viewer
**Type:** frontend
**Points:** 3
**Depends on:** S502

**Goal:** Admin can read the patient's full conversation history (read-only).

**Scope:**
- Section within patient detail page (tab or scrollable section below chart)
- Display all messages for this patient:
  - User messages: aligned left with patient name
  - AI messages: aligned left with "Coach" label
  - Channel badge: "SMS" or "Web" next to each message
  - Timestamp below each message
  - MMS images: display inline (signed URL from Supabase Storage)
- Pagination: load last 50 messages, "Load more" button for older
- Filter: dropdown to show "All", "SMS only", "Web only"
- Read-only: admin cannot reply or edit

**Edge cases:**
- MMS images: signed URL may expire → generate fresh on page load
- Very long messages → show full text (no truncation in admin view)
- Messages in Chinese → display as-is (admin can read or use browser translate)
- No messages → "No conversations yet"

**Acceptance criteria:**
1. All messages displayed in chronological order
2. Channel badge visible per message
3. MMS images render inline
4. Pagination loads older messages
5. Channel filter works
6. Read-only (no edit/reply UI)
7. Admin can view conversations in both English and Chinese

**Out of scope:**
- Replying to patient (S508)
- Exporting conversations
- Real-time updates (V2)

---

### S504 — Patient detail: weekly reports and insights
**Type:** frontend
**Points:** 2
**Depends on:** S502, S401

**Goal:** Admin sees patient's weekly reports and AI-generated insights.

**Scope:**
- Section within patient detail page:
  - List of weekly reports (most recent first): week range + summary preview
  - Click report → opens report web page (S402) in new tab
  - Latest insights: display most recent report's `insights` array as bullet points

**Edge cases:**
- No reports yet → "No weekly reports generated yet"
- Report with no insights → show summary only

**Acceptance criteria:**
1. Reports listed with correct date ranges
2. Click → opens report page in new tab
3. Latest insights displayed inline
4. Empty state handled
5. Most recent report highlighted

---

### S505 — Alert system: pain spike detection
**Type:** backend/frontend
**Points:** 3
**Depends on:** S501

**Goal:** Automatically detect when a patient's pain spikes above their baseline and flag it on the dashboard.

**Scope:**
- Detection logic (run in patient list query or as computed field):
  - For each patient: compare most recent pain_level to their 7-day average pain
  - If `latest_pain - avg_pain >= 2`: flag as alert
  - Example: avg pain = 2, latest pain = 5 → alert (delta = 3)
- Dashboard display:
  - Red badge on patient list card
  - Alert detail: "Pain 5 reported — avg is 2.3 (▲ 2.7 above average)"
  - Alert section at top of patient list: group all alerted patients
- No separate `alerts` table for V1 — computed at query time

**Edge cases:**
- Patient with only 1 metric → can't compute average, no alert
- Patient with avg pain 0 (no pain) reports pain 2 → delta is 2, triggers alert (correct)
- Pain drops back to normal → alert clears on next page load
- Patient reports high pain via SMS at 11pm → alert visible on next dashboard load (not real-time)

**Acceptance criteria:**
1. Pain spike ≥ 2 above 7-day average → red badge
2. Alert detail shows specific numbers
3. Alerted patients grouped at top of list
4. Single data point → no alert
5. Alert clears when pain returns to normal
6. Multiple alerted patients all shown

**Out of scope:**
- Real-time push notifications (V2)
- Configurable alert thresholds (V2 — hardcode ≥ 2 delta)
- Email/SMS alerts to admin (V2)

---

### S506 — Inactive patient indicators
**Type:** frontend
**Points:** 2
**Depends on:** S501

**Goal:** Visual indicator on dashboard for patients who haven't logged in 5+ days.

**Scope:**
- In patient list query: calculate `days_since_last_message` per patient
- If ≥ 5 days: amber badge "Inactive — {N} days"
- Summary at top of dashboard: "3 patients inactive for 5+ days"
- Sort inactive patients together when sorting by status

**Edge cases:**
- Patient with no messages at all → count from `created_at`
- Patient inactive for 30+ days → show "Inactive — 30+ days" (cap display)

**Acceptance criteria:**
1. 5+ days inactive → amber badge with day count
2. Summary count at top of patient list
3. Works for patients with zero messages
4. 30+ days displays correctly

---

### S507 — Patient management: add, edit, toggle active
**Type:** fullstack
**Points:** 3
**Depends on:** S501

**Goal:** Admin can add new patients, edit profiles, and toggle active/inactive status.

**Scope:**
- **Add patient** dialog (shadcn Dialog):
  - Fields: name (required), phone (required, E.164 validated), language (EN/CN toggle), condition (optional)
  - On submit: create patient record in DB
  - Send welcome SMS: "Hi {name}, you've been enrolled in V-Health's recovery coach. We'll check in on how you're feeling. Reply STOP to opt out."
  - Auto-trigger consent flow on patient's first reply
- **Edit patient** dialog:
  - Edit name, language, condition, practitioner name
  - Save to DB
- **Toggle active/inactive:**
  - Button on patient detail page
  - Inactive patients don't receive nudges or weekly reports
  - Can be reactivated

**Edge cases:**
- Duplicate phone number → error: "A patient with this number already exists"
- Invalid phone number → validation error
- Admin adds patient who already texted in (SMS onboarding created record) → error "already exists" with link to existing patient
- Welcome SMS fails → patient still created, error logged

**Acceptance criteria:**
1. Add patient dialog creates DB record
2. Welcome SMS sent on creation
3. Duplicate phone → clear error message
4. Edit dialog updates fields correctly
5. Toggle active/inactive works
6. Inactive patients excluded from cron jobs
7. Phone validated as E.164 format

**Out of scope:**
- Deleting patients (soft delete in V2)
- Assigning to specific practitioners (V2 — single admin for now)
- Bulk import

---

### S508 — "Send check-in" button: practitioner triggers patient SMS
**Type:** fullstack
**Points:** 2
**Depends on:** S502, S303

**Goal:** Practitioners can send a check-in message to a patient directly from the dashboard.

**Scope:**
- Button on patient detail page: "Send Check-in"
- Click → dialog with pre-filled message: "Hi {name}, this is V-Health. How are you feeling? We'd love to hear an update."
- Admin can edit the message before sending
- Send via Twilio (same as nudge)
- Message saved to DB with `role = 'assistant'` and metadata `{ "admin_initiated": true }` in a jsonb column (or simple `is_admin_initiated boolean` on messages table). Note: do NOT use `role = 'system'` as it conflicts with Claude's system prompt in context builder.
- Rate limit: max 1 admin check-in per patient per day

**Edge cases:**
- Patient is opted out → button disabled with tooltip "Patient has opted out"
- Patient has no phone → button disabled (shouldn't happen, but guard)
- Send failure → toast error: "Failed to send. Please try again."

**Acceptance criteria:**
1. Button visible on patient detail page
2. Pre-filled message editable
3. SMS sent via Twilio
4. Message saved to DB
5. Opted-out patient → button disabled
6. Rate limited: 1 per patient per day
7. Success toast: "Check-in sent to {name}"

---

### S509 — Dashboard overview cards
**Type:** frontend
**Points:** 2
**Depends on:** S501

**Goal:** Top-level summary statistics on the dashboard main page.

**Scope:**
- Overview section at top of `/dashboard/patients`:
  - **Total Patients:** count of active patients
  - **Active This Week:** patients with messages in last 7 days
  - **Messages This Week:** total message count this week
  - **Avg Discomfort Trend:** arrow showing overall trend (avg of all patients' discomfort this week vs. last week)
- Cards use shadcn Card component with large monospace numbers
- Server component with Supabase aggregate queries

**Acceptance criteria:**
1. All 4 cards display correct data
2. Trend arrow shows correct direction
3. Cards load without blocking patient list
4. Zero patients → cards show 0 values gracefully

---

### S510 — Sentry integration
**Type:** setup
**Points:** 2
**Depends on:** S103

**Goal:** Error tracking across all routes and API endpoints.

**Scope:**
- Install `@sentry/nextjs` in `apps/web`
- Configure `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`
- `instrumentation.ts` for Next.js instrumentation hook
- DSN in env var: `SENTRY_DSN`
- Source maps uploaded on build
- Test: throw an intentional error → verify it appears in Sentry dashboard

**Acceptance criteria:**
1. Client-side errors captured in Sentry
2. Server-side errors captured in Sentry
3. Source maps resolve correctly (readable stack traces)
4. `SENTRY_DSN` env var configured in Vercel

**Out of scope:**
- Alert rules (S6)
- Performance monitoring (V2)

---

### S511 — Mobile responsiveness pass
**Type:** frontend
**Points:** 2
**Depends on:** S501, S502

**Goal:** Dashboard is fully usable on tablet and functional on mobile.

**Scope:**
- Dashboard sidebar: collapses to Sheet/drawer on mobile (shadcn Sheet)
- Patient list: cards stack vertically on mobile; key info visible without horizontal scroll
- Patient detail: chart scales down; metrics table scrolls horizontally; conversation log full-width
- Overview cards: 2x2 grid on tablet, stacked on mobile
- Test at: 375px (phone), 768px (tablet), 1024px (desktop)
- Navigation: bottom nav or hamburger menu on mobile

**Acceptance criteria:**
1. 375px: all content accessible, no horizontal scroll, sidebar hidden behind hamburger
2. 768px: sidebar collapsible, charts render correctly
3. 1024px: full sidebar visible, two-column layouts
4. Touch targets ≥ 44px on all interactive elements
5. All text readable without zooming
