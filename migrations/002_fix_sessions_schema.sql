-- 002_fix_sessions_schema.sql
-- Add missing columns to sessions table that PostgresSessionStore expects

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS turns JSONB NOT NULL DEFAULT '[]';
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS original_request JSONB NOT NULL DEFAULT '{}';
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Also fix usage table to match usage.ts expectations
ALTER TABLE usage ADD COLUMN IF NOT EXISTS event_type TEXT;
ALTER TABLE usage ADD COLUMN IF NOT EXISTS latency_ms INTEGER;
ALTER TABLE usage ADD COLUMN IF NOT EXISTS tokens_used JSONB;
ALTER TABLE usage ADD COLUMN IF NOT EXISTS billed BOOLEAN NOT NULL DEFAULT false;
