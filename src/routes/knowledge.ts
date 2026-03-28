import { Hono } from "hono";
import { z } from "zod";
import { adminAuth } from "../middleware/admin-auth.js";
import { pool } from "../db/pool.js";
import { getOrgBySlug } from "../repositories/organizations.js";
import { scrapeAndStore } from "../services/firecrawl.js";
import {
  generatePresignedUploadUrl,
  getObject,
  buildStorageKey,
} from "../services/storage.js";

// ---------------------------------------------------------------------------
// Knowledge Base routes — all require Clerk JWT via adminAuth
// ---------------------------------------------------------------------------

const AddUrlSchema = z.object({
  url: z.string().url(),
  title: z.string().optional(),
});

const UploadConfirmSchema = z.object({
  storageKey: z.string().min(1),
  filename: z.string().min(1),
  title: z.string().optional(),
});

const UploadUrlRequestSchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1),
});

const UpdateDocSchema = z.object({
  title: z.string().min(1).optional(),
});

const BulkDeleteSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
});

// Legacy schema kept for backward compat
const LegacyUploadSchema = z.object({
  blobUrl: z.string().url(),
  filename: z.string().min(1),
});

// Helpers
async function resolveOrg(slug: string) {
  const org = await getOrgBySlug(slug);
  if (!org || org.deleted_at) return null;
  return org;
}

export const knowledgeRoute = new Hono()
  .use("*", adminAuth)

  // GET /admin/orgs/:slug/docs — list doc sources with content row count
  .get("/orgs/:slug/docs", async (c) => {
    const org = await resolveOrg(c.req.param("slug"));
    if (!org) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);

    const result = await pool.query<{
      id: string;
      source_type: string;
      source_path: string;
      title: string | null;
      status: string;
      last_sync_at: Date | null;
      error_message: string | null;
      content_count: string;
    }>(
      `SELECT ds.id, ds.source_type, ds.source_path, ds.title, ds.status,
              ds.last_sync_at, ds.error_message,
              COUNT(dc.id) AS content_count
       FROM doc_sources ds
       LEFT JOIN doc_content dc ON dc.source_id = ds.id
       WHERE ds.org_id = $1
       GROUP BY ds.id
       ORDER BY ds.loaded_at DESC`,
      [org.id],
    );

    return c.json(
      result.rows.map((row) => ({
        id: row.id,
        source_type: row.source_type,
        source_path: row.source_path,
        title: row.title,
        status: row.status,
        last_sync_at: row.last_sync_at,
        error_message: row.error_message,
        content_count: Number(row.content_count),
      })),
    );
  })

  // POST /admin/orgs/:slug/docs/url — create URL source + fire-and-forget scrape
  .post("/orgs/:slug/docs/url", async (c) => {
    const org = await resolveOrg(c.req.param("slug"));
    if (!org) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);

    const body = await c.req.json().catch(() => ({}));
    const parsed = AddUrlSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Invalid request body", code: "VALIDATION_ERROR" }, 400);
    }

    const { url, title } = parsed.data;

    const insertResult = await pool.query<{ id: string }>(
      `INSERT INTO doc_sources (org_id, source_type, source_path, title, status, config)
       VALUES ($1, 'url_crawl', $2, $3, 'pending', '{}')
       RETURNING id`,
      [org.id, url, title ?? null],
    );
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const sourceId = insertResult.rows[0]!.id;

    setImmediate(() => {
      Promise.resolve(scrapeAndStore(org.id, sourceId, url)).catch((err) => {
        console.error("scrape failed", sourceId, err);
      });
    });

    return c.json({ id: sourceId, status: "pending" }, 202);
  })

  // POST /admin/orgs/:slug/docs/upload-url — get presigned upload URL (Railway Buckets)
  .post("/orgs/:slug/docs/upload-url", async (c) => {
    const org = await resolveOrg(c.req.param("slug"));
    if (!org) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);

    const body = await c.req.json().catch(() => ({}));
    const parsed = UploadUrlRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Invalid request body", code: "VALIDATION_ERROR" }, 400);
    }

    const storageKey = buildStorageKey(org.id, parsed.data.filename);
    const uploadUrl = await generatePresignedUploadUrl(storageKey, parsed.data.contentType);

    return c.json({ uploadUrl, storageKey });
  })

  // POST /admin/orgs/:slug/docs/upload — confirm upload: fetch from bucket, extract text
  .post("/orgs/:slug/docs/upload", async (c) => {
    const org = await resolveOrg(c.req.param("slug"));
    if (!org) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);

    const body = await c.req.json().catch(() => ({}));

    // Try new schema first (storageKey-based), fall back to legacy (blobUrl-based)
    const newParsed = UploadConfirmSchema.safeParse(body);
    const legacyParsed = LegacyUploadSchema.safeParse(body);

    if (!newParsed.success && !legacyParsed.success) {
      return c.json({ error: "Invalid request body", code: "VALIDATION_ERROR" }, 400);
    }

    const filename = newParsed.success ? newParsed.data.filename : legacyParsed.data!.filename;
    const title = newParsed.success ? (newParsed.data.title ?? filename) : filename;
    const storageKey = newParsed.success ? newParsed.data.storageKey : null;
    const blobUrl = legacyParsed.success ? legacyParsed.data.blobUrl : null;

    const insertResult = await pool.query<{ id: string }>(
      `INSERT INTO doc_sources (org_id, source_type, source_path, title, status, storage_key, config)
       VALUES ($1, 'file_upload', $2, $3, 'processing', $4, $5)
       RETURNING id`,
      [org.id, filename, title, storageKey, JSON.stringify({ blobUrl })],
    );
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const sourceId = insertResult.rows[0]!.id;

    try {
      let rawBuffer: Buffer;
      if (storageKey) {
        rawBuffer = await getObject(storageKey);
      } else if (blobUrl) {
        const fetchRes = await fetch(blobUrl);
        if (!fetchRes.ok) throw new Error(`Failed to fetch blob: ${fetchRes.status}`);
        rawBuffer = Buffer.from(await fetchRes.arrayBuffer());
      } else {
        throw new Error("No storage key or blob URL provided");
      }

      let content: string;
      const isPdf = filename.toLowerCase().endsWith(".pdf");

      if (isPdf) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pdfParseModule = await import("pdf-parse") as any;
        const pdfParse = pdfParseModule.default ?? pdfParseModule;
        const parsed = await pdfParse(rawBuffer);
        content = parsed.text;
      } else {
        content = rawBuffer.toString("utf-8");
      }

      await pool.query(
        `INSERT INTO doc_content (org_id, source_id, title, content, metadata)
         VALUES ($1, $2, $3, $4, '{}')
         ON CONFLICT (source_id) WHERE (metadata->>'page_url') IS NULL
         DO UPDATE SET content = EXCLUDED.content, title = EXCLUDED.title, updated_at = now()`,
        [org.id, sourceId, title, content],
      );

      await pool.query(
        `UPDATE doc_sources SET status = 'ready', last_sync_at = now() WHERE id = $1`,
        [sourceId],
      );

      return c.json({ id: sourceId, status: "ready" }, 201);
    } catch (err) {
      await pool.query(
        `UPDATE doc_sources SET status = 'error', error_message = $2 WHERE id = $1`,
        [sourceId, String(err)],
      );
      throw err;
    }
  })

  // GET /admin/orgs/:slug/docs/:id/content — preview extracted content
  .get("/orgs/:slug/docs/:id/content", async (c) => {
    const org = await resolveOrg(c.req.param("slug"));
    if (!org) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);

    const result = await pool.query<{
      id: string;
      title: string;
      content: string;
    }>(
      `SELECT dc.id, dc.title, dc.content
       FROM doc_content dc
       JOIN doc_sources ds ON ds.id = dc.source_id
       WHERE ds.id = $1 AND ds.org_id = $2
       LIMIT 1`,
      [c.req.param("id"), org.id],
    );

    const row = result.rows[0];
    if (!row) {
      return c.json({ error: "No content found", code: "NOT_FOUND" }, 404);
    }
    return c.json(row);
  })

  // PATCH /admin/orgs/:slug/docs/:id — update doc source title
  .patch("/orgs/:slug/docs/:id", async (c) => {
    const org = await resolveOrg(c.req.param("slug"));
    if (!org) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);

    const body = await c.req.json().catch(() => ({}));
    const parsed = UpdateDocSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Invalid request body", code: "VALIDATION_ERROR" }, 400);
    }

    const result = await pool.query<{ id: string }>(
      `UPDATE doc_sources SET title = COALESCE($3, title)
       WHERE id = $1 AND org_id = $2
       RETURNING id`,
      [c.req.param("id"), org.id, parsed.data.title ?? null],
    );

    if (result.rowCount === 0) {
      return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
    }
    return c.json({ ok: true });
  })

  // POST /admin/orgs/:slug/docs/bulk-delete — delete multiple doc sources
  .post("/orgs/:slug/docs/bulk-delete", async (c) => {
    const org = await resolveOrg(c.req.param("slug"));
    if (!org) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);

    const body = await c.req.json().catch(() => ({}));
    const parsed = BulkDeleteSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Invalid request body", code: "VALIDATION_ERROR" }, 400);
    }

    const result = await pool.query(
      `DELETE FROM doc_sources WHERE id = ANY($1) AND org_id = $2`,
      [parsed.data.ids, org.id],
    );

    return c.json({ deleted: result.rowCount ?? 0 });
  })

  // GET /admin/orgs/:slug/docs/search — full-text search across doc_content
  .get("/orgs/:slug/docs/search", async (c) => {
    const org = await resolveOrg(c.req.param("slug"));
    if (!org) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);

    const q = c.req.query("q");
    if (!q || q.trim().length === 0) {
      return c.json({ error: "Query parameter 'q' is required", code: "VALIDATION_ERROR" }, 400);
    }

    const result = await pool.query<{
      id: string;
      source_id: string;
      title: string;
      snippet: string;
    }>(
      `SELECT dc.id, dc.source_id, dc.title,
              ts_headline('english', dc.content, plainto_tsquery('english', $2),
                'MaxWords=60, MinWords=20, StartSel=**, StopSel=**') AS snippet
       FROM doc_content dc
       WHERE dc.org_id = $1
         AND to_tsvector('english', dc.content) @@ plainto_tsquery('english', $2)
       LIMIT 20`,
      [org.id, q],
    );

    return c.json(result.rows);
  })

  // GET /admin/orgs/:slug/docs/:id/status — poll scrape status
  .get("/orgs/:slug/docs/:id/status", async (c) => {
    const org = await resolveOrg(c.req.param("slug"));
    if (!org) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);

    const result = await pool.query<{
      id: string;
      status: string;
      last_sync_at: Date | null;
      error_message: string | null;
    }>(
      `SELECT id, status, last_sync_at, error_message FROM doc_sources
       WHERE id = $1 AND org_id = $2`,
      [c.req.param("id"), org.id],
    );

    const row = result.rows[0];
    if (!row) {
      return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
    }

    return c.json({
      id: row.id,
      status: row.status,
      last_sync_at: row.last_sync_at,
      error_message: row.error_message,
    });
  })

  // POST /admin/orgs/:slug/docs/:id/sync — re-sync URL source
  .post("/orgs/:slug/docs/:id/sync", async (c) => {
    const org = await resolveOrg(c.req.param("slug"));
    if (!org) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);

    const result = await pool.query<{
      id: string;
      source_type: string;
      source_path: string;
    }>(
      `SELECT id, source_type, source_path FROM doc_sources
       WHERE id = $1 AND org_id = $2`,
      [c.req.param("id"), org.id],
    );

    const source = result.rows[0];
    if (!source) {
      return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
    }

    if (source.source_type !== "url_crawl") {
      return c.json(
        { error: "Only URL sources can be synced", code: "INVALID_SOURCE_TYPE" },
        400,
      );
    }

    setImmediate(() => {
      Promise.resolve(scrapeAndStore(org.id, source.id, source.source_path)).catch((err) => {
        console.error("re-sync failed", source.id, err);
      });
    });

    return c.json({ id: source.id, status: "pending" }, 202);
  })

  // DELETE /admin/orgs/:slug/docs/:id — delete source (CASCADE removes doc_content)
  .delete("/orgs/:slug/docs/:id", async (c) => {
    const org = await resolveOrg(c.req.param("slug"));
    if (!org) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);

    const result = await pool.query(
      `DELETE FROM doc_sources WHERE id = $1 AND org_id = $2 RETURNING id`,
      [c.req.param("id"), org.id],
    );

    if (result.rowCount === 0) {
      return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
    }

    return c.json({ ok: true });
  });
