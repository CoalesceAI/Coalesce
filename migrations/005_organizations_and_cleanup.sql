-- 005_organizations_and_cleanup.sql
-- Rename tenants → organizations, fix column drift, drop usage table

-- 1. Drop usage table first (has FK refs to tenants and sessions)
DROP TABLE IF EXISTS usage;

-- 2. Rename tenants → organizations
ALTER TABLE tenants RENAME TO organizations;
ALTER INDEX idx_tenants_slug RENAME TO idx_organizations_slug;

-- 3. Rename tenant_id → org_id on all tables
ALTER TABLE api_keys RENAME COLUMN tenant_id TO org_id;
ALTER TABLE doc_sources RENAME COLUMN tenant_id TO org_id;
ALTER TABLE doc_content RENAME COLUMN tenant_id TO org_id;
ALTER TABLE sessions RENAME COLUMN tenant_id TO org_id;

-- 4. Add settings to organizations (if not exists)
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}';

-- 5. Fix api_keys: add prefix, add revoked_at, migrate active→revoked_at
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS prefix TEXT DEFAULT '';
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;
UPDATE api_keys SET revoked_at = now() WHERE active = false;
ALTER TABLE api_keys DROP COLUMN IF EXISTS active;

-- 6. Sessions: add external_customer_id, resolved_at
--    (last_accessed_at already exists from migration 002)
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS external_customer_id TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
