-- Bug fix: widget_usage.conversations_count was never incremented because
-- widget_usage_increment only bumps messages_count / tokens_*.  This RPC is
-- called once from the session route when a new conversation row is inserted
-- so that daily rollups actually reflect unique conversations.

CREATE OR REPLACE FUNCTION public.widget_conversation_started(
  p_clinic_id uuid, p_date date
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.widget_usage (clinic_id, date, conversations_count, messages_count, tokens_in, tokens_out, estimated_cost_usd)
  VALUES (p_clinic_id, p_date, 1, 0, 0, 0, 0)
  ON CONFLICT (clinic_id, date) DO UPDATE
    SET conversations_count = public.widget_usage.conversations_count + 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.widget_conversation_started(uuid, date) TO service_role;
