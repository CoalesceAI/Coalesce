-- 007_admin_ui.sql: Schema additions for admin UI

-- doc_sources: add status, config, error tracking
ALTER TABLE doc_sources
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending'
    CHECK (status IN ('pending','crawling','processing','ready','error')),
  ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ;

-- doc_sources: expand source_type enum
ALTER TABLE doc_sources DROP CONSTRAINT IF EXISTS doc_sources_source_type_check;
ALTER TABLE doc_sources ADD CONSTRAINT doc_sources_source_type_check
  CHECK (source_type IN ('url_crawl','file_upload','notion','openapi','manual','mdx','raw','url'));

-- organizations: soft delete support
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- doc_content: unique index per source (for single-page upserts in Phase 3A)
CREATE UNIQUE INDEX IF NOT EXISTS idx_doc_content_source_unique
  ON doc_content (source_id)
  WHERE (metadata->>'page_url') IS NULL;
