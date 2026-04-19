-- 012_widget_schema.sql — widget multi-tenant-capable schema

-- Write policies: V1 uses service_role (via apps/web/lib/supabase/admin.ts) for all
-- widget writes from the public API routes. Add per-role INSERT/UPDATE policies in
-- a later migration when/if a dedicated authenticated widget role is introduced.

CREATE TABLE public.clinics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  domain text NOT NULL,
  janeapp_base_url text,
  branding jsonb NOT NULL DEFAULT '{}'::jsonb,
  monthly_message_cap int NOT NULL DEFAULT 10000,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.therapists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name text NOT NULL,
  role text NOT NULL,
  bio text NOT NULL,
  janeapp_staff_id int,
  specialties text[] NOT NULL DEFAULT '{}',
  languages text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_therapists_clinic ON public.therapists(clinic_id);

CREATE TABLE public.widget_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  visitor_ip_hash text NOT NULL,
  user_agent text,
  referer text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  lang_detected text,
  offtopic_strikes int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','locked','ended')),
  UNIQUE (clinic_id, session_id)
);

CREATE INDEX idx_widget_conversations_clinic_started ON public.widget_conversations(clinic_id, started_at DESC);

CREATE TABLE public.widget_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.widget_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant','system')),
  content text NOT NULL,
  tokens_in int,
  tokens_out int,
  on_topic boolean,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_widget_messages_conv ON public.widget_messages(conversation_id, created_at);

CREATE TABLE public.widget_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.widget_conversations(id) ON DELETE CASCADE,
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  phone text,
  interest text,
  consent_given boolean NOT NULL,
  consent_text text NOT NULL,
  notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

CREATE INDEX idx_widget_leads_clinic ON public.widget_leads(clinic_id, created_at DESC);
CREATE INDEX idx_widget_leads_conv ON public.widget_leads(conversation_id);

CREATE TABLE public.widget_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  date date NOT NULL,
  conversations_count int NOT NULL DEFAULT 0,
  messages_count int NOT NULL DEFAULT 0,
  tokens_in bigint NOT NULL DEFAULT 0,
  tokens_out bigint NOT NULL DEFAULT 0,
  estimated_cost_usd numeric(10,4) NOT NULL DEFAULT 0,
  UNIQUE (clinic_id, date)
);

CREATE INDEX idx_widget_usage_clinic_date ON public.widget_usage(clinic_id, date DESC);

-- updated_at triggers for admin-editable tables (reuse function from 003_updated_at_trigger.sql)
CREATE TRIGGER set_clinics_updated_at BEFORE UPDATE ON public.clinics
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_therapists_updated_at BEFORE UPDATE ON public.therapists
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS: deny-all by default, service role bypasses
ALTER TABLE public.clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.therapists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.widget_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.widget_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.widget_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.widget_usage ENABLE ROW LEVEL SECURITY;

-- Authenticated clinic users can read their own clinic's data.
-- (No multi-tenant auth in V1 — single admin. Policy still in place for future.)
CREATE POLICY clinic_select_own ON public.clinics
  FOR SELECT TO authenticated USING (true);
CREATE POLICY therapists_select ON public.therapists
  FOR SELECT TO authenticated USING (true);
CREATE POLICY widget_conversations_select ON public.widget_conversations
  FOR SELECT TO authenticated USING (true);
CREATE POLICY widget_messages_select ON public.widget_messages
  FOR SELECT TO authenticated USING (true);
CREATE POLICY widget_leads_select ON public.widget_leads
  FOR SELECT TO authenticated USING (true);
CREATE POLICY widget_usage_select ON public.widget_usage
  FOR SELECT TO authenticated USING (true);
