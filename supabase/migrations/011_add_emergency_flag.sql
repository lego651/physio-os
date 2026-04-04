-- S603: Add is_emergency flag to messages table
-- Allows querying and auditing all escalated emergency interactions.

ALTER TABLE public.messages
  ADD COLUMN is_emergency boolean NOT NULL DEFAULT false;

-- Partial index: only indexes emergency rows, keeping the index tiny.
CREATE INDEX idx_messages_emergency ON public.messages(patient_id, created_at DESC)
  WHERE is_emergency = true;
