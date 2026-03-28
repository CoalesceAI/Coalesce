-- 010_activity_log.sql: Activity log for tracking admin and system events

CREATE TABLE IF NOT EXISTS activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  actor TEXT NOT NULL DEFAULT 'system',
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_org ON activity_log(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log(created_at DESC);
