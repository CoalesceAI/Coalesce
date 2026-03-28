import { Hono } from "hono";
import { z } from "zod";
import { adminAuth } from "../middleware/admin-auth.js";
import { pool } from "../db/pool.js";
import { getOrgBySlug } from "../repositories/organizations.js";
import { scrapeAndStore } from "../services/firecrawl.js";

// ---------------------------------------------------------------------------
// Knowledge Base routes — all require Clerk JWT via adminAuth
//
//   GET    /admin/orgs/:slug/docs                — list doc sources
//   POST   /admin/orgs/:slug/docs/url            — add URL source (fire-and-forget scrape)
//   POST   /admin/orgs/:slug/docs/upload         — add file source via blobUrl
//   GET    /admin/orgs/:slug/docs/:id/status     — poll scrape status
//   POST   /admin/orgs/:slug/docs/:id/sync       — re-sync URL source
//   DELETE /admin/orgs/:slug/docs/:id            — delete source + content
// ---------------------------------------------------------------------------

const AddUrlSchema = z.object({
  url: z.string().url(),
});

const UploadSchema = z.object({
  blobUrl: z.string().url(),
  filename: z.string().min(1),
});

export const knowledgeRoute = new Hono()
  .use("*", adminAuth)

  // GET /admin/orgs/:slug/docs — list doc sources with content row count
  .get("/orgs/:slug/docs", async (c) => {
    const org = await getOrgBySlug(c.req.param("slug"));
    if (!org || org.deleted_at) {
      return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
    }

    const result = await pool.query<{
      id: string;
      source_type: string;
      source_path: string;
      status: string;
      last_sync_at: Date | null;
      error_message: string | null;
      content_count: string;
    }>(
      `SELECT ds.id, ds.source_type, ds.source_path, ds.status,
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
        status: row.status,
        last_sync_at: row.last_sync_at,
        error_message: row.error_message,
        content_count: Number(row.content_count),
      })),
    );
  })

  // POST /admin/orgs/:slug/docs/url — create URL source + fire-and-forget scrape
  .post("/orgs/:slug/docs/url", async (c) => {
    const org = await getOrgBySlug(c.req.param("slug"));
    if (!org || org.deleted_at) {
      return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
    }

    const body = await c.req.json().catch(() => ({}));
    const parsed = AddUrlSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Invalid request body", code: "VALIDATION_ERROR" }, 400);
    }

    const { url } = parsed.data;

    const insertResult = await pool.query<{ id: string }>(
      `INSERT INTO doc_sources (org_id, source_type, source_path, status, config)
       VALUES ($1, 'url_crawl', $2, 'pending', '{}')
       RETURNING id`,
      [org.id, url],
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

  // POST /admin/orgs/:slug/docs/upload — receive blobUrl, fetch + extract text, upsert
  .post("/orgs/:slug/docs/upload", async (c) => {
    const org = await getOrgBySlug(c.req.param("slug"));
    if (!org || org.deleted_at) {
      return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
    }

    const body = await c.req.json().catch(() => ({}));
    const parsed = UploadSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Invalid request body", code: "VALIDATION_ERROR" }, 400);
    }

    const { blobUrl, filename } = parsed.data;

    // Create source record
    const insertResult = await pool.query<{ id: string }>(
      `INSERT INTO doc_sources (org_id, source_type, source_path, status, config)
       VALUES ($1, 'file_upload', $2, 'processing', $3)
       RETURNING id`,
      [org.id, filename, JSON.stringify({ blobUrl })],
    );
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const sourceId = insertResult.rows[0]!.id;

    try {
      // Fetch the blob
      const fetchRes = await fetch(blobUrl);
      if (!fetchRes.ok) {
        throw new Error(`Failed to fetch blob: ${fetchRes.status}`);
      }

      let content: string;
      const isPdf = filename.toLowerCase().endsWith(".pdf");

      if (isPdf) {
        // pdf-parse ships both CJS and ESM; import the default export
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pdfParseModule = await import("pdf-parse") as any;
        const pdfParse = pdfParseModule.default ?? pdfParseModule;
        const buffer = await fetchRes.arrayBuffer();
        const parsed = await pdfParse(Buffer.from(buffer));
        content = parsed.text;
      } else {
        content = await fetchRes.text();
      }

      await pool.query(
        `INSERT INTO doc_content (org_id, source_id, title, content, metadata)
         VALUES ($1, $2, $3, $4, '{}')
         ON CONFLICT (source_id) WHERE (metadata->>'page_url') IS NULL
         DO UPDATE SET content = EXCLUDED.content, title = EXCLUDED.title, updated_at = now()`,
        [org.id, sourceId, filename, content],
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

  // GET /admin/orgs/:slug/docs/:id/status — poll scrape status
  .get("/orgs/:slug/docs/:id/status", async (c) => {
    const org = await getOrgBySlug(c.req.param("slug"));
    if (!org || org.deleted_at) {
      return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
    }

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
    const org = await getOrgBySlug(c.req.param("slug"));
    if (!org || org.deleted_at) {
      return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
    }

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
    const org = await getOrgBySlug(c.req.param("slug"));
    if (!org || org.deleted_at) {
      return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
    }

    const result = await pool.query(
      `DELETE FROM doc_sources WHERE id = $1 AND org_id = $2 RETURNING id`,
      [c.req.param("id"), org.id],
    );

    if (result.rowCount === 0) {
      return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
    }

    return c.json({ ok: true });
  });
