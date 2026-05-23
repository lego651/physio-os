-- 024_drop_widget_orphans.sql
-- Cleanup: drop pre-pivot widget_* tables left over from ec1eb31 (012_widget_schema.sql).
-- That migration file was later replaced by 012_intake_records.sql, so these tables
-- never had a corresponding DROP in the migration history — they only exist in prod.
-- All 4 tables had 0 rows as of 2026-05-23. Safe to remove.
-- Idempotent: DROP IF EXISTS.

DROP TABLE IF EXISTS public.widget_messages      CASCADE;
DROP TABLE IF EXISTS public.widget_conversations CASCADE;
DROP TABLE IF EXISTS public.widget_leads         CASCADE;
DROP TABLE IF EXISTS public.widget_usage         CASCADE;
