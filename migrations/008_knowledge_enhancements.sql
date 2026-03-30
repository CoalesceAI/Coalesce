-- 008_knowledge_enhancements.sql: Knowledge base improvements

-- doc_sources: user-friendly display name
ALTER TABLE doc_sources ADD COLUMN IF NOT EXISTS title TEXT;

-- doc_sources: crawl configuration for multi-page crawls
ALTER TABLE doc_sources ADD COLUMN IF NOT EXISTS crawl_config JSONB DEFAULT '{}';

-- doc_sources: storage key for uploaded files (Railway Buckets)
ALTER TABLE doc_sources ADD COLUMN IF NOT EXISTS storage_key TEXT;

-- doc_content: full-text search index
CREATE INDEX IF NOT EXISTS idx_doc_content_fts
  ON doc_content USING gin(to_tsvector('english', content));
