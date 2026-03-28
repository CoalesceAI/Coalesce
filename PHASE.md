
## Migration 007 (REQUIRED — add to Phase 1)

Create `migrations/007_admin_ui.sql`:

```sql
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
```

## packages/types/ (REQUIRED — add to Phase 1)

Create `packages/types/index.ts` with shared interfaces. Update root `package.json`:
```json
{ "workspaces": ["admin", "packages/types"] }
```

`admin/package.json` adds: `"@coalesce/types": "*"` as a dependency.

Interfaces to include: `Organization`, `Session`, `ConversationTurn`, `ApiKey`. Copy from `src/domain/` — do not import from `src/` directly.

## Admin auth pattern

`src/middleware/admin-auth.ts` verifies Clerk JWT only — it does NOT set org context. Admin routes that need org context call `getOrgBySlug(slug)` directly in the route handler after auth passes.

```typescript
// Pattern for org-scoped admin routes:
export const adminRoute = new Hono()
  .use('*', adminAuth)                    // verify Clerk JWT → 401 if invalid
  .get('/orgs/:slug', async (c) => {
    const org = await getOrgBySlug(c.req.param('slug'))
    if (!org || org.deleted_at) return c.json({ error: 'Not found' }, 404)
    // ... rest of handler
  })
```

## Tests for Phase 1

Create `tests/admin-auth.test.ts`:
- [ ] Valid Clerk JWT → next() called
- [ ] Missing Authorization header → 401
- [ ] Malformed JWT → 401
- [ ] GET /admin/ping with valid JWT → { ok: true }
- [ ] GET /admin/ping without auth → 401

Mock `@clerk/backend` verifyToken to return a valid session or throw.
