-- 012_widget_schema.sql — widget multi-tenant-capable schema

CREATE TABLE clinics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  domain TEXT NOT NULL,
  janeapp_base_url TEXT,
  branding JSONB NOT NULL DEFAULT '{}'::jsonb,
  monthly_message_cap INT NOT NULL DEFAULT 10000,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE therapists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  bio TEXT NOT NULL,
  janeapp_staff_id INT,
  specialties TEXT[] NOT NULL DEFAULT '{}',
  languages TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE widget_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL UNIQUE,
  visitor_ip_hash TEXT NOT NULL,
  user_agent TEXT,
  referer TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  lang_detected TEXT,
  offtopic_strikes INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','locked','ended'))
);

CREATE TABLE widget_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES widget_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content TEXT NOT NULL,
  tokens_in INT,
  tokens_out INT,
  on_topic BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_widget_messages_conv ON widget_messages(conversation_id, created_at);

CREATE TABLE widget_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES widget_conversations(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  interest TEXT,
  consent_given BOOLEAN NOT NULL,
  consent_text TEXT NOT NULL,
  notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

CREATE INDEX idx_widget_leads_clinic ON widget_leads(clinic_id, created_at DESC);

CREATE TABLE widget_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  conversations_count INT NOT NULL DEFAULT 0,
  messages_count INT NOT NULL DEFAULT 0,
  tokens_in BIGINT NOT NULL DEFAULT 0,
  tokens_out BIGINT NOT NULL DEFAULT 0,
  estimated_cost_usd NUMERIC(10,4) NOT NULL DEFAULT 0,
  UNIQUE (clinic_id, date)
);

-- RLS: deny-all by default, service role bypasses
ALTER TABLE clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE therapists ENABLE ROW LEVEL SECURITY;
ALTER TABLE widget_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE widget_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE widget_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE widget_usage ENABLE ROW LEVEL SECURITY;

-- Authenticated clinic users can read their own clinic's data.
-- (No multi-tenant auth in V1 — single admin. Policy still in place for future.)
CREATE POLICY clinic_select_own ON clinics
  FOR SELECT TO authenticated USING (true);
CREATE POLICY therapists_select ON therapists
  FOR SELECT TO authenticated USING (true);
CREATE POLICY widget_conversations_select ON widget_conversations
  FOR SELECT TO authenticated USING (true);
CREATE POLICY widget_messages_select ON widget_messages
  FOR SELECT TO authenticated USING (true);
CREATE POLICY widget_leads_select ON widget_leads
  FOR SELECT TO authenticated USING (true);
CREATE POLICY widget_usage_select ON widget_usage
  FOR SELECT TO authenticated USING (true);
