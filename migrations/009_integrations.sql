-- 009_integrations.sql: Organization integrations for knowledge base

CREATE TABLE IF NOT EXISTS organization_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('notion', 'github', 'linear', 'fern', 'slack')),
  access_token TEXT,
  refresh_token TEXT,
  config JSONB DEFAULT '{}',
  connected_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, provider)
);

-- doc_sources: link to integration
ALTER TABLE doc_sources ADD COLUMN IF NOT EXISTS integration_id UUID REFERENCES organization_integrations(id) ON DELETE SET NULL;
