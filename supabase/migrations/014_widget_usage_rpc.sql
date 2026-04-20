-- Task 5.4: widget_usage_increment RPC
--
-- Upserts a per-day usage rollup row for the given clinic, incrementing
-- messages_count, tokens_in, tokens_out, and estimated_cost_usd on conflict.
--
-- Cost model (Claude Haiku 4.5):
--   $1 per MTok input
--   $5 per MTok output

CREATE OR REPLACE FUNCTION widget_usage_increment(
  p_clinic_id UUID, p_date DATE, p_tokens_in INT, p_tokens_out INT
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.widget_usage (clinic_id, date, conversations_count, messages_count, tokens_in, tokens_out, estimated_cost_usd)
  VALUES (p_clinic_id, p_date, 0, 1, p_tokens_in, p_tokens_out,
          -- Haiku 4.5: $1/MTok input, $5/MTok output
          (p_tokens_in::numeric / 1e6) * 1.0 + (p_tokens_out::numeric / 1e6) * 5.0)
  ON CONFLICT (clinic_id, date) DO UPDATE
    SET messages_count = public.widget_usage.messages_count + 1,
        tokens_in  = public.widget_usage.tokens_in  + p_tokens_in,
        tokens_out = public.widget_usage.tokens_out + p_tokens_out,
        estimated_cost_usd = public.widget_usage.estimated_cost_usd
                           + (p_tokens_in::numeric / 1e6) * 1.0
                           + (p_tokens_out::numeric / 1e6) * 5.0;
END;
$$;

GRANT EXECUTE ON FUNCTION widget_usage_increment(UUID, DATE, INT, INT) TO service_role;
