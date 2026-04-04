-- Atomic SMS usage increment function (avoids read-then-write race condition)
CREATE OR REPLACE FUNCTION increment_sms_usage(
  p_month text,
  p_segments integer,
  p_cost numeric
)
RETURNS void
LANGUAGE sql
AS $$
  INSERT INTO sms_usage (month, segments, cost_estimate, updated_at)
  VALUES (p_month, p_segments, p_cost, now())
  ON CONFLICT (month)
  DO UPDATE SET
    segments = sms_usage.segments + EXCLUDED.segments,
    cost_estimate = sms_usage.cost_estimate + EXCLUDED.cost_estimate,
    updated_at = now();
$$;
