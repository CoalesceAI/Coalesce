-- 003_add_tokens_used.sql
ALTER TABLE usage ADD COLUMN IF NOT EXISTS tokens_used JSONB;
