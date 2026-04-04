# Performance Audit — DB Indexes & Query Optimization

Sprint: S6 | Ticket: S606 | Date: 2026-04-03

---

## Schema snapshot (after migration 010)

| Table    | Row estimate (30 patients, steady state) | Notes                                    |
|----------|------------------------------------------|------------------------------------------|
| patients | 30–100                                   | Grows slowly                             |
| messages | ~1 000–5 000                             | ~50 msgs/patient active month            |
| metrics  | ~500–2 000                               | ~1–2 entries/patient/day                 |
| reports  | ~150                                     | 1/patient/active week, 52 wk/year max    |

At this scale sequential scans are cheap (< 1 ms), but correct indexes prevent
full-table scans from becoming a problem if the clinic scales to 500+ patients
and years of data.

---

## Hot query inventory

### Q1 — Chat route: patient lookup by auth user

**File:** `apps/web/app/api/chat/route.ts`

```sql
SELECT id, auth_user_id, name, ... FROM patients WHERE auth_user_id = $1
```

**Previous plan:** Sequential scan on `patients` (no index on `auth_user_id`).

**After migration 010:**
Uses `idx_patients_auth_user` — partial B-tree index on `auth_user_id WHERE auth_user_id IS NOT NULL`.

**Scale impact (30 patients):** Negligible without index; critical at 10 000+ users.
Even at 30 patients this executes on every chat message, so an index is warranted.

---

### Q2 — Chat route: message history fetch

**File:** `apps/web/app/api/chat/route.ts`

```sql
SELECT id, role, content, created_at
FROM messages
WHERE patient_id = $1
ORDER BY created_at DESC
LIMIT 50
```

**Plan:** Uses `idx_messages_patient_created (patient_id, created_at DESC)` — index-only scan
returning the 50 most recent rows without touching heap pages for non-selected columns.

**Status:** Covered by existing index. No change needed.

---

### Q3 — Chat route: user message count

**File:** `apps/web/app/api/chat/route.ts`

```sql
SELECT COUNT(*) FROM messages WHERE patient_id = $1 AND role = 'user'
```

**Previous plan:** Uses `idx_messages_patient_created`, then filters `role = 'user'`
on each row — extra bitmap heap pass for role.

**After migration 010:**
`idx_messages_patient_role_created (patient_id, role, created_at DESC)` covers
`patient_id + role` predicate and eliminates the row-level filter.

**Scale impact:** At 1 000 messages/patient, the old plan scanned all 1 000 index
rows before filtering; new plan scans only the `user`-role subset (~500 rows).

---

### Q4 — Admin dashboard: patient list with aggregates

**File:** `apps/web/app/(clinic)/dashboard/patients/page.tsx`

Five parallel queries:
1. `SELECT ... FROM patients ORDER BY created_at DESC` — full scan (expected; 30 rows).
2. `SELECT patient_id, created_at FROM messages WHERE patient_id IN (...) ORDER BY created_at DESC` — uses `idx_messages_patient_created`.
3. `SELECT patient_id, ... FROM metrics WHERE patient_id IN (...) ORDER BY recorded_at DESC` — uses `idx_metrics_patient_recorded`.
4. `SELECT COUNT(*) FROM messages WHERE created_at >= $week_start AND created_at <= $now` — **previously did a full scan** (existing index starts with `patient_id`).
5. `SELECT discomfort FROM metrics WHERE recorded_at >= $start AND recorded_at <= $end AND discomfort IS NOT NULL` — repeated twice for this/last week.

**After migration 010:**

- Q4 now uses `idx_messages_created_at (created_at DESC)` — index range scan on created_at.
- Q5 uses `idx_metrics_recorded_discomfort (recorded_at DESC) WHERE discomfort IS NOT NULL` — partial index, pre-filters null rows.

**Scale impact:** At 5 000 messages, Q4 previously scanned all 5 000 rows; new index
reduces scan to only the rows in the week window. Q5 benefit increases with the
proportion of null-discomfort rows (patients who report pain only).

---

### Q5 — Patient detail: metrics

**File:** `apps/web/app/(clinic)/dashboard/patients/[id]/page.tsx`

```sql
SELECT id, recorded_at, pain_level, ... FROM metrics
WHERE patient_id = $1
ORDER BY recorded_at DESC
LIMIT 200
```

**Plan:** Uses `idx_metrics_patient_recorded (patient_id, recorded_at DESC)` — covered.

**Status:** No change needed.

---

### Q6 — Conversation log (admin): messages with channel filter

**File:** `apps/web/app/api/admin/patients/[id]/messages/route.ts`

```sql
SELECT id, role, content, channel, media_urls, created_at
FROM messages
WHERE patient_id = $1 [AND channel = $2]
ORDER BY created_at ASC
LIMIT $limit OFFSET $offset
```

**Plan:** Uses `idx_messages_patient_created (patient_id, created_at DESC)`.
PostgreSQL can use this index in reverse for `ASC` ordering.
The optional `channel` filter is applied as a post-index predicate.

**Status:** Covered. At 1 000 messages/patient, OFFSET pagination is acceptable.
If messages grow to 10 000+, cursor-based pagination using `created_at > $cursor`
would be preferable (avoids O(offset) skip cost).

---

### Q7 — Weekly-report cron: active patient scan

**File:** `apps/web/app/api/cron/weekly-report/route.ts`

```sql
SELECT id, phone, name, language FROM patients
WHERE active = true AND opted_out = false
```

**Previous plan:** Sequential scan; no index on `(active, opted_out)`.

**After migration 010:**
Uses `idx_patients_active_not_opted_out (id) WHERE active = true AND opted_out = false`
— partial index stores only qualifying patients, making the scan as small as possible.

**Scale impact:** At 500 patients where 60% are inactive/opted-out, partial index
reduces scanned rows from 500 to ~200.

---

### Q8 — Weekly-report cron: metrics for current and previous week

**File:** `packages/ai-core/src/tools/generate-report.ts`

```sql
-- Current week
SELECT pain_level, discomfort, ... FROM metrics
WHERE patient_id = $1 AND recorded_at >= $week_start AND recorded_at < $week_end
ORDER BY recorded_at ASC

-- Previous week
SELECT pain_level, discomfort, ... FROM metrics
WHERE patient_id = $1 AND recorded_at >= $prev_week_start AND recorded_at < $week_start
```

**Plan:** Both queries use `idx_metrics_patient_recorded (patient_id, recorded_at DESC)`.
PostgreSQL can scan the index in either direction; `ASC` ordering uses the index
in reverse (no sort step needed).

**Status:** Covered. No change needed.

---

### Q9 — Pattern detection: all metrics for a patient

**File:** `packages/ai-core/src/tools/pattern-detection.ts`

```sql
SELECT pain_level, discomfort, ... FROM metrics
WHERE patient_id = $1
ORDER BY recorded_at ASC
```

**Plan:** Uses `idx_metrics_patient_recorded` in reverse order — full patient history.
At 500 metrics/patient this returns all rows; the query is intentionally unbounded.
If metrics grow to 10 000+/patient, consider adding a `LIMIT` with a date floor
(e.g. `recorded_at >= NOW() - INTERVAL '90 days'`) in `pattern-detection.ts`.

**Status:** Covered by existing index. Application-level limit recommended at scale.

---

### Q10 — Nudge cron: candidate patients + last message + last metric

**File:** `apps/web/app/api/cron/nudge/route.ts`

Three queries:

```sql
-- 1. Candidate patients
SELECT id, phone, name, profile, language, created_at, last_nudged_at FROM patients
WHERE active = true AND opted_out = false AND consent_at IS NOT NULL

-- 2. Last user message per patient (batch)
SELECT patient_id, created_at FROM messages
WHERE role = 'user' AND patient_id IN (...)
ORDER BY created_at DESC

-- 3. Last metric per patient (batch)
SELECT patient_id, discomfort, pain_level, recorded_at FROM metrics
WHERE patient_id IN (...)
ORDER BY recorded_at DESC
```

**After migration 010:**

- Q10.1 uses `idx_patients_active_not_opted_out`. The additional `consent_at IS NOT NULL` is a post-predicate filter on the partial index result.
- Q10.2 uses `idx_messages_patient_role_created (patient_id, role, created_at DESC)` — role predicate is now part of the index.
- Q10.3 uses `idx_metrics_patient_recorded (patient_id, recorded_at DESC)` — covered.

**Note on Q10.2:** This query fetches all messages for all candidate patients with
`role = 'user'`, then takes the first per patient in application code. At 30
patients × 500 user messages = 15 000 rows transferred. The query is already
batched (no per-patient N+1), which is the correct pattern. Index ensures the
sort is index-order (no in-memory sort).

---

### Q11 — Report page: report by token

**File:** `apps/web/app/report/[token]/page.tsx`

```sql
SELECT *, patients(name) FROM reports WHERE token = $1
```

**Plan:** The UNIQUE constraint on `reports.token` creates an implicit B-tree index.
This is a unique equality lookup — O(log n) regardless of table size.

**Status:** Covered by constraint. No migration change needed.

---

### Q12 — Weekly reports component: reports list by patient

**File:** `apps/web/app/(clinic)/dashboard/patients/[id]/weekly-reports.tsx`

```sql
SELECT id, week_start, summary, insights, token, created_at FROM reports
WHERE patient_id = $1
ORDER BY week_start DESC
```

**Plan:** Uses `idx_reports_patient_week (patient_id, week_start DESC)` — covered.

**Status:** No change needed.

---

## Index summary

| Index name                          | Table    | Columns / predicate                                      | New? | Covers            |
|-------------------------------------|----------|----------------------------------------------------------|------|-------------------|
| `idx_patients_phone` (UNIQUE)       | patients | `phone` (implicit from UNIQUE)                           | —    | Phone lookup      |
| `idx_patients_clinic`               | patients | `clinic_id`                                              | —    | Clinic filter     |
| `idx_patients_auth_user`            | patients | `auth_user_id` WHERE NOT NULL                            | Yes  | Q1                |
| `idx_patients_active_not_opted_out` | patients | `id` WHERE `active=true AND opted_out=false`             | Yes  | Q7, Q10.1         |
| `idx_messages_patient_created`      | messages | `(patient_id, created_at DESC)`                          | —    | Q2, Q6            |
| `idx_messages_patient_role_created` | messages | `(patient_id, role, created_at DESC)`                    | Yes  | Q3, Q10.2         |
| `idx_messages_created_at`           | messages | `created_at DESC`                                        | Yes  | Q4                |
| `idx_metrics_patient_recorded`      | metrics  | `(patient_id, recorded_at DESC)`                         | —    | Q5, Q8, Q9, Q10.3 |
| `idx_metrics_recorded_discomfort`   | metrics  | `recorded_at DESC` WHERE `discomfort IS NOT NULL`        | Yes  | Q4 (overview)     |
| `idx_reports_patient_week`          | reports  | `(patient_id, week_start DESC)`                          | —    | Q12               |
| UNIQUE constraint on `reports.token`| reports  | `token`                                                  | —    | Q11               |

---

## Recommendations

1. **Application-level limit for pattern detection (Q9):** Add a date floor
   (`recorded_at >= NOW() - INTERVAL '90 days'`) to `pattern-detection.ts` once
   any patient exceeds ~2 000 metrics. This prevents unbounded full-history scans.

2. **Cursor-based pagination for conversation log (Q6):** Once any patient exceeds
   ~5 000 messages, replace `OFFSET`-based pagination with
   `WHERE created_at < $cursor ORDER BY created_at DESC LIMIT $n`.

3. **Q10.2 data volume:** The nudge cron fetches all user messages for all
   candidate patients to find the most recent per patient. This is a correct
   batch pattern today. If messages grow to 100 000+ total, consider a
   materialized `last_message_at` column on `patients` (updated via trigger or
   application code on each message insert) to replace the batch fetch entirely.

4. **ANALYZE after migration:** After applying migration 010, run
   `ANALYZE patients; ANALYZE messages; ANALYZE metrics;` so the query planner
   picks up the new index statistics immediately.
