CREATE TABLE sms_usage (
  month text PRIMARY KEY,           -- format: YYYY-MM
  segments integer DEFAULT 0,
  cost_estimate decimal(10,4) DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

-- Allow service role full access
ALTER TABLE sms_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON sms_usage
  FOR ALL USING (auth.role() = 'service_role');
