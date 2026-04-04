-- S606: Performance indexes
-- Covers hot query paths identified by audit (see docs/performance-audit.md).
-- All statements use CREATE INDEX IF NOT EXISTS for safe re-runs.

-- ---------------------------------------------------------------------------
-- patients
-- ---------------------------------------------------------------------------

-- Chat route: WHERE auth_user_id = $1 (per-request patient lookup)
-- Nudge cron: reads last_nudged_at — not a WHERE predicate, but needs fast
--             access via the cron's candidate patient scan.
CREATE INDEX IF NOT EXISTS idx_patients_auth_user
  ON public.patients(auth_user_id)
  WHERE auth_user_id IS NOT NULL;

-- Weekly-report + nudge crons: WHERE active = true AND opted_out = false
-- Partial index — filters the two boolean columns and only stores qualifying
-- rows, keeping the index small and the predicate evaluation cheap.
CREATE INDEX IF NOT EXISTS idx_patients_active_not_opted_out
  ON public.patients(id)
  WHERE active = true AND opted_out = false;

-- ---------------------------------------------------------------------------
-- messages
-- ---------------------------------------------------------------------------

-- Nudge cron: fetches last user message per patient across ALL patients.
-- Pattern: WHERE role = 'user' AND patient_id IN (...) ORDER BY created_at DESC
-- Adding `role` to the composite index eliminates the row-level filter pass.
-- The existing idx_messages_patient_created(patient_id, created_at DESC) is
-- kept for the common pattern without a role filter; this new index covers the
-- role-filtered variant used by the nudge cron and message count in chat route.
CREATE INDEX IF NOT EXISTS idx_messages_patient_role_created
  ON public.messages(patient_id, role, created_at DESC);

-- Dashboard overview: messages this week count
-- Pattern: WHERE created_at >= $week_start AND created_at <= $now (no patient filter)
-- The existing composite index starts with patient_id so Postgres won't use it
-- for a clinic-wide date range scan.  A standalone created_at index fixes this.
CREATE INDEX IF NOT EXISTS idx_messages_created_at
  ON public.messages(created_at DESC);

-- ---------------------------------------------------------------------------
-- metrics
-- ---------------------------------------------------------------------------

-- Dashboard overview: discomfort this/last week
-- Pattern: WHERE recorded_at >= $start AND recorded_at <= $end AND discomfort IS NOT NULL
-- A partial index on recorded_at covering only rows where discomfort is not
-- null eliminates the IS NOT NULL filter pass for both overview queries.
CREATE INDEX IF NOT EXISTS idx_metrics_recorded_discomfort
  ON public.metrics(recorded_at DESC)
  WHERE discomfort IS NOT NULL;

-- Weekly-report cron: filters metrics by patient_id + date window across two
-- consecutive weeks.  The existing idx_metrics_patient_recorded covers this
-- pattern; no additional index is needed here.  However, the nudge cron fetches
-- metrics for ALL patients at once:
-- Pattern: WHERE patient_id IN (...) ORDER BY recorded_at DESC (no date filter)
-- The existing composite index on (patient_id, recorded_at DESC) handles this
-- correctly — confirmed covered, no new index needed.

-- ---------------------------------------------------------------------------
-- reports
-- ---------------------------------------------------------------------------

-- Report page: WHERE token = $1
-- The UNIQUE constraint on reports.token already creates a B-tree index.
-- No additional index is needed; confirmed covered.

-- Weekly-reports component: WHERE patient_id = $1 ORDER BY week_start DESC
-- The existing idx_reports_patient_week(patient_id, week_start DESC) covers
-- this query.  No additional index needed.
