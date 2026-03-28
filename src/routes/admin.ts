import { Hono } from "hono";
import { z } from "zod";
import { adminAuth } from "../middleware/admin-auth.js";
import { pool } from "../db/pool.js";
import { getRecentActivity } from "../services/activity.js";
import {
  listOrgs,
  getOrgBySlug,
  createOrg,
  updateOrg,
  rotateSigningSecret,
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

const UpdateOrgSchema = z.object({
  name: z.string().min(1).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
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

  .get("/stats/timeline", async (c) => {
    const days = Math.min(Number(c.req.query("days") ?? "30"), 90);
    const result = await pool.query<{
      day: string;
      total: string;
      resolved: string;
      needs_info: string;
      unknown: string;
    }>(
      `SELECT
        date_trunc('day', created_at)::date AS day,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'resolved') AS resolved,
        COUNT(*) FILTER (WHERE status = 'needs_info') AS needs_info,
        COUNT(*) FILTER (WHERE status = 'unknown') AS unknown
       FROM sessions
       WHERE created_at > now() - make_interval(days => $1)
       GROUP BY day ORDER BY day`,
      [days],
    );
    return c.json(
      result.rows.map((r) => ({
        day: r.day,
        total: Number(r.total),
        resolved: Number(r.resolved),
        needs_info: Number(r.needs_info),
        unknown: Number(r.unknown),
      })),
    );
  })

  .get("/stats/by-org", async (c) => {
    const result = await pool.query<{
      org_id: string;
      org_name: string;
      org_slug: string;
      total: string;
      resolved: string;
      avg_resolution_ms: string | null;
    }>(
      `SELECT
        s.org_id,
        COALESCE(o.name, 'Unknown') AS org_name,
        COALESCE(o.slug, 'unknown') AS org_slug,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE s.status = 'resolved') AS resolved,
        AVG(EXTRACT(EPOCH FROM (s.resolved_at - s.created_at)) * 1000)
          FILTER (WHERE s.status = 'resolved' AND s.resolved_at IS NOT NULL)
          AS avg_resolution_ms
       FROM sessions s
       LEFT JOIN organizations o ON o.id = s.org_id
       WHERE s.org_id IS NOT NULL
       GROUP BY s.org_id, o.name, o.slug
       ORDER BY total DESC`,
    );
    return c.json(
      result.rows.map((r) => ({
        org_id: r.org_id,
        org_name: r.org_name,
        org_slug: r.org_slug,
        total: Number(r.total),
        resolved: Number(r.resolved),
        avg_resolution_ms: r.avg_resolution_ms !== null ? Number(r.avg_resolution_ms) : null,
      })),
    );
  })

  .get("/sessions", async (c) => {
    const limit = Math.min(Number(c.req.query("limit") ?? "50"), 100);
    const offset = Number(c.req.query("offset") ?? "0");
    const orgSlug = c.req.query("org");
    const status = c.req.query("status");
    const customerId = c.req.query("customer_id");
    const search = c.req.query("q");

    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (orgSlug) {
      conditions.push(`o.slug = $${idx++}`);
      params.push(orgSlug);
    }
    if (status) {
      conditions.push(`s.status = $${idx++}`);
      params.push(status);
    }
    if (customerId) {
      conditions.push(`s.external_customer_id = $${idx++}`);
      params.push(customerId);
    }
    if (search) {
      conditions.push(`(s.original_request::text ILIKE $${idx} OR s.id::text ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    params.push(limit, offset);

    const listResult = await pool.query<{
      id: string;
      org_id: string | null;
      org_name: string | null;
      org_slug: string | null;
      external_customer_id: string | null;
      status: string;
      created_at: Date;
      resolved_at: Date | null;
      turn_count: string;
    }>(
      `SELECT s.id, s.org_id, o.name AS org_name, o.slug AS org_slug,
              s.external_customer_id, s.status, s.created_at, s.resolved_at,
              jsonb_array_length(s.turns) AS turn_count
       FROM sessions s
       LEFT JOIN organizations o ON o.id = s.org_id
       ${whereClause}
       ORDER BY s.created_at DESC
       LIMIT $${idx++} OFFSET $${idx}`,
      params,
    );

    const countParams = params.slice(0, -2);
    const countResult = await pool.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM sessions s LEFT JOIN organizations o ON o.id = s.org_id ${whereClause}`,
      countParams,
    );

    return c.json({
      sessions: listResult.rows.map((row) => ({
        id: row.id,
        org_id: row.org_id,
        org_name: row.org_name,
        org_slug: row.org_slug,
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

  // GET /admin/stats/resolution-funnel
  .get("/stats/resolution-funnel", async (c) => {
    const result = await pool.query<{
      total: string;
      reached_needs_info: string;
      resolved: string;
      avg_to_needs_info_ms: string | null;
      avg_to_resolved_ms: string | null;
    }>(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status IN ('needs_info', 'resolved')) AS reached_needs_info,
        COUNT(*) FILTER (WHERE status = 'resolved') AS resolved,
        AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) * 1000)
          FILTER (WHERE status = 'resolved' AND resolved_at IS NOT NULL)
          AS avg_to_resolved_ms,
        NULL AS avg_to_needs_info_ms
      FROM sessions
    `);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const row = result.rows[0]!;
    return c.json({
      total: Number(row.total),
      reached_needs_info: Number(row.reached_needs_info),
      resolved: Number(row.resolved),
      avg_to_resolved_ms: row.avg_to_resolved_ms ? Number(row.avg_to_resolved_ms) : null,
    });
  })

  // PATCH /admin/sessions/:id — manual status override
  .patch("/sessions/:id", async (c) => {
    const body = await c.req.json().catch(() => ({})) as { status?: string };
    const validStatuses = ["active", "resolved", "needs_info", "unknown"];
    if (!body.status || !validStatuses.includes(body.status)) {
      return c.json({ error: "Invalid status", code: "VALIDATION_ERROR" }, 400);
    }
    const result = await pool.query(
      `UPDATE sessions SET status = $1, resolved_at = CASE WHEN $1 = 'resolved' THEN COALESCE(resolved_at, now()) ELSE resolved_at END
       WHERE id = $2 RETURNING id`,
      [body.status, c.req.param("id")],
    );
    if (result.rowCount === 0) {
      return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
    }
    return c.json({ ok: true });
  })

  // GET /admin/sessions/export — CSV export
  .get("/sessions/export", async (c) => {
    const result = await pool.query<{
      id: string;
      org_slug: string | null;
      external_customer_id: string | null;
      status: string;
      created_at: Date;
      resolved_at: Date | null;
      turn_count: string;
      endpoint: string | null;
      error_code: string | null;
    }>(
      `SELECT s.id, o.slug AS org_slug, s.external_customer_id, s.status,
              s.created_at, s.resolved_at,
              jsonb_array_length(s.turns) AS turn_count,
              s.original_request->>'endpoint' AS endpoint,
              s.original_request->>'error_code' AS error_code
       FROM sessions s
       LEFT JOIN organizations o ON o.id = s.org_id
       ORDER BY s.created_at DESC
       LIMIT 10000`,
    );

    const header = "id,org,customer_id,status,endpoint,error_code,turns,created_at,resolved_at\n";
    const rows = result.rows.map((r) =>
      [r.id, r.org_slug ?? "", r.external_customer_id ?? "", r.status, r.endpoint ?? "", r.error_code ?? "", r.turn_count, r.created_at.toISOString(), r.resolved_at?.toISOString() ?? ""].join(","),
    ).join("\n");

    c.header("Content-Type", "text/csv");
    c.header("Content-Disposition", "attachment; filename=sessions.csv");
    return c.body(header + rows);
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

  // PATCH /admin/orgs/:slug — update org name/settings
  .patch("/orgs/:slug", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const parsed = UpdateOrgSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Invalid request body", code: "VALIDATION_ERROR" }, 400);
    }
    const updated = await updateOrg(c.req.param("slug"), parsed.data);
    if (!updated) {
      return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
    }
    return c.json(updated);
  })

  // GET /admin/orgs/:slug/stats — org-specific session stats
  .get("/orgs/:slug/stats", async (c) => {
    const org = await getOrgBySlug(c.req.param("slug"));
    if (!org || org.deleted_at) {
      return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
    }
    const result = await pool.query<{
      total: string;
      resolved: string;
      needs_info: string;
      unknown: string;
      active: string;
      avg_resolution_ms: string | null;
    }>(
      `SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'resolved') AS resolved,
        COUNT(*) FILTER (WHERE status = 'needs_info') AS needs_info,
        COUNT(*) FILTER (WHERE status = 'unknown') AS unknown,
        COUNT(*) FILTER (WHERE status = 'active') AS active,
        AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) * 1000)
          FILTER (WHERE status = 'resolved' AND resolved_at IS NOT NULL)
          AS avg_resolution_ms
       FROM sessions WHERE org_id = $1`,
      [org.id],
    );
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const row = result.rows[0]!;
    return c.json({
      total: Number(row.total),
      resolved: Number(row.resolved),
      needs_info: Number(row.needs_info),
      unknown: Number(row.unknown),
      active: Number(row.active),
      avg_resolution_ms: row.avg_resolution_ms !== null ? Number(row.avg_resolution_ms) : null,
    });
  })

  // POST /admin/orgs/:slug/signing-secret/rotate — rotate signing secret
  .post("/orgs/:slug/signing-secret/rotate", async (c) => {
    const newSecret = await rotateSigningSecret(c.req.param("slug"));
    if (!newSecret) {
      return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
    }
    return c.json({ signing_secret: newSecret });
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
  })

  // -------------------------------------------------------------------------
  // Activity Feed
  // -------------------------------------------------------------------------

  .get("/activity", async (c) => {
    const limit = Math.min(Number(c.req.query("limit") ?? "50"), 200);
    const orgId = c.req.query("org_id");
    const events = await getRecentActivity(limit, orgId ?? undefined);
    return c.json(events);
  });
