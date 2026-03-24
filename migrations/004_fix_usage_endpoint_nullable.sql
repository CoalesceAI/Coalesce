-- 004_fix_usage_endpoint_nullable.sql
-- Make endpoint nullable since usage.ts uses event_type instead
ALTER TABLE usage ALTER COLUMN endpoint DROP NOT NULL;
ALTER TABLE usage ALTER COLUMN endpoint SET DEFAULT '';
