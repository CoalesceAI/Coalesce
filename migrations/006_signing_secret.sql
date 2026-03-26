-- 006_signing_secret.sql
-- Add signing_secret to organizations for signed support URLs
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS signing_secret TEXT;

-- Generate a secret for existing orgs
UPDATE organizations SET signing_secret = encode(gen_random_bytes(32), 'hex') WHERE signing_secret IS NULL;

-- Make it NOT NULL going forward
ALTER TABLE organizations ALTER COLUMN signing_secret SET NOT NULL;
ALTER TABLE organizations ALTER COLUMN signing_secret SET DEFAULT encode(gen_random_bytes(32), 'hex');
