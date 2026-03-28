import { Hono } from "hono";
import { z } from "zod";
import { adminAuth } from "../middleware/admin-auth.js";
import { pool } from "../db/pool.js";
import {
  listOrgs,
  getOrgBySlug,
  createOrg,
  softDeleteOrg,
} from "../repositories/organizations.js";
import {
  createApiKey,
  listOrgApiKeys,
  revokeApiKey,
} from "../repositories/api-keys.js";

// ---------------------------------------------------------------------------
// Admin routes — all require Clerk JWT via adminAuth
//
// Analytics:
//   GET /admin/ping                        — health check
//   GET /admin/stats                       — aggregate session stats
//   GET /admin/sessions                    — paginated session list
//   GET /admin/sessions/:id                — session detail with turns[]
//
// Org management:
//   GET    /admin/orgs                     — list orgs
//   POST   /admin/orgs                     — create org
//   GET    /admin/orgs/:slug               — org detail
//   DELETE /admin/orgs/:slug               — soft delete
//   GET    /admin/orgs/:slug/keys          — list api keys
//   POST   /admin/orgs/:slug/keys          — generate key (rawKey returned once)
//   DELETE /admin/orgs/:slug/keys/:id      — revoke key
// ---------------------------------------------------------------------------

const CreateOrgSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
});

export const adminRoute = new Hono()
  .use("*", adminAuth)

  // -------------------------------------------------------------------------
  // Health
  // -------------------------------------------------------------------------

  .get("/ping", (c) => c.json({ ok: true }))

  // -------------------------------------------------------------------------
  // Analytics
  // -------------------------------------------------------------------------

  .get("/stats", async (c) => {
    const result = await pool.query<{
      total: string;
      resolved: string;
      needs_info: string;
      unknown: string;
      active: string;
      avg_resolution_ms: string | null;
      last_24h_count: string;
      last_7d_count: string;
    }>(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'resolved') AS resolved,
        COUNT(*) FILTER (WHERE status = 'needs_info') AS needs_info,
        COUNT(*) FILTER (WHERE status = 'unknown') AS unknown,
        COUNT(*) FILTER (WHERE status = 'active') AS active,
        AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) * 1000)
          FILTER (WHERE status = 'resolved' AND resolved_at IS NOT NULL)
          AS avg_resolution_ms,
        COUNT(*) FILTER (WHERE created_at > now() - interval '24 hours') AS last_24h_count,
        COUNT(*) FILTER (WHERE created_at > now() - interval '7 days') AS last_7d_count
      FROM sessions
    `);
    // COUNT(*) always returns a row
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const row = result.rows[0]!;
    return c.json({
      total: Number(row.total),
      resolved: Number(row.resolved),
      needs_info: Number(row.needs_info),
      unknown: Number(row.unknown),
      active: Number(row.active),
      avg_resolution_ms: row.avg_resolution_ms !== null ? Number(row.avg_resolution_ms) : null,
      last_24h_count: Number(row.last_24h_count),
      last_7d_count: Number(row.last_7d_count),
    });
  })

  .get("/sessions", async (c) => {
    const limit = Math.min(Number(c.req.query("limit") ?? "50"), 100);
    const offset = Number(c.req.query("offset") ?? "0");

    const listResult = await pool.query<{
      id: string;
      org_id: string | null;
      external_customer_id: string | null;
      status: string;
      created_at: Date;
      resolved_at: Date | null;
      turn_count: string;
    }>(
      `SELECT id, org_id, external_customer_id, status, created_at, resolved_at,
              jsonb_array_length(turns) AS turn_count
       FROM sessions
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    );

    const countResult = await pool.query<{ total: string }>(
      "SELECT COUNT(*) AS total FROM sessions",
    );

    return c.json({
      sessions: listResult.rows.map((row) => ({
        id: row.id,
        org_id: row.org_id,
        external_customer_id: row.external_customer_id,
        status: row.status,
        created_at: row.created_at,
        resolved_at: row.resolved_at,
        turn_count: Number(row.turn_count),
      })),
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      total: Number(countResult.rows[0]!.total),
      limit,
      offset,
    });
  })

  .get("/sessions/:id", async (c) => {
    const id = c.req.param("id");
    const result = await pool.query<{
      id: string;
      org_id: string | null;
      external_customer_id: string | null;
      turns: unknown[];
      original_request: unknown;
      status: string;
      created_at: Date;
      resolved_at: Date | null;
    }>(
      `SELECT id, org_id, external_customer_id, turns, original_request,
              status, created_at, resolved_at
       FROM sessions WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      return c.json({ error: "Session not found", code: "SESSION_NOT_FOUND" }, 404);
    }
    return c.json(row);
  })

  // -------------------------------------------------------------------------
  // Org management
  // -------------------------------------------------------------------------

  // GET /admin/orgs — list all non-deleted orgs
  .get("/orgs", async (c) => {
    const orgs = await listOrgs();
    return c.json(orgs);
  })

  // POST /admin/orgs — create org
  .post("/orgs", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const parsed = CreateOrgSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Invalid request body", code: "VALIDATION_ERROR" }, 400);
    }
    const { slug, name } = parsed.data;
    try {
      const org = await createOrg(slug, name);
      return c.json(org, 201);
    } catch (err: unknown) {
      // Postgres unique violation: code 23505
      if (
        err instanceof Error &&
        "code" in err &&
        (err as { code: string }).code === "23505"
      ) {
        return c.json({ error: "Slug already exists", code: "DUPLICATE_SLUG" }, 409);
      }
      throw err;
    }
  })

  // GET /admin/orgs/:slug — get single org
  .get("/orgs/:slug", async (c) => {
    const org = await getOrgBySlug(c.req.param("slug"));
    if (!org || org.deleted_at) {
      return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
    }
    return c.json(org);
  })

  // DELETE /admin/orgs/:slug — soft delete
  .delete("/orgs/:slug", async (c) => {
    const deleted = await softDeleteOrg(c.req.param("slug"));
    if (!deleted) {
      return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
    }
    return c.json({ ok: true });
  })

  // POST /admin/orgs/:slug/keys — create API key (rawKey returned once)
  .post("/orgs/:slug/keys", async (c) => {
    const org = await getOrgBySlug(c.req.param("slug"));
    if (!org || org.deleted_at) {
      return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
    }
    const body = await c.req.json().catch(() => ({})) as { label?: string };
    const result = await createApiKey(org.id, body.label);
    return c.json(result, 201);
  })

  // GET /admin/orgs/:slug/keys — list keys (no rawKey)
  .get("/orgs/:slug/keys", async (c) => {
    const org = await getOrgBySlug(c.req.param("slug"));
    if (!org || org.deleted_at) {
      return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
    }
    const keys = await listOrgApiKeys(org.id);
    return c.json(keys);
  })

  // DELETE /admin/orgs/:slug/keys/:id — revoke key
  .delete("/orgs/:slug/keys/:id", async (c) => {
    const org = await getOrgBySlug(c.req.param("slug"));
    if (!org || org.deleted_at) {
      return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
    }
    const revoked = await revokeApiKey(c.req.param("id"), org.id);
    if (!revoked) {
      return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
    }
    return c.json({ ok: true });
  });
