-- Sprint 4 (S404): add last_nudged_at to track inactivity nudge sends
ALTER TABLE patients ADD COLUMN last_nudged_at timestamptz;
