import { Hono } from "hono";
import { z } from "zod";
import { adminAuth, type AdminAuthEnv } from "../middleware/admin-auth.js";
import { pool } from "../db/pool.js";
import { getRecentActivity } from "../services/activity.js";
import {
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
import {
  listUserOrgs,
  listOrgMembers,
  addMember,
  removeMember,
  updateMemberRole,
  getUserOrgRole,
  countUserOrgs,
  countOrgAdmins,
  findMemberByEmail,
} from "../repositories/organization-members.js";
import { bootstrapDefaultOrgIfNeeded } from "../repositories/org-bootstrap.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FREE_TIER_ORG_LIMIT = 1;

async function requireOrgMembership(
  orgSlug: string,
  userId: string,
  requiredRole?: "admin",
): Promise<
  | { org: { id: string; slug: string; name: string; settings: Record<string, unknown>; signing_secret: string; created_at: Date; updated_at: Date }; role: "admin" | "member" }
  | { error: { message: string; code: string; status: 403 | 404 } }
> {
  const org = await getOrgBySlug(orgSlug);
  if (!org || org.deleted_at) {
    return { error: { message: "Not found", code: "NOT_FOUND", status: 404 } };
  }
  const role = await getUserOrgRole(org.id, userId);
  if (!role) {
    return { error: { message: "Not a member of this organization", code: "FORBIDDEN", status: 403 } };
  }
  if (requiredRole === "admin" && role !== "admin") {
    return { error: { message: "Admin role required", code: "FORBIDDEN", status: 403 } };
  }
  return { org, role };
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const CreateOrgSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
});

const UpdateOrgSchema = z.object({
  name: z.string().min(1).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});

const AddMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "member"]).default("member"),
});

const UpdateMemberRoleSchema = z.object({
  role: z.enum(["admin", "member"]),
});

export const adminRoute = new Hono<AdminAuthEnv>()
  .use("*", adminAuth)

  // -------------------------------------------------------------------------
  // Health
  // -------------------------------------------------------------------------

  .get("/ping", (c) => c.json({ ok: true }))

  // -------------------------------------------------------------------------
  // Current user
  // -------------------------------------------------------------------------

  .get("/me/orgs", async (c) => {
    const userId = c.get("userId");
    const orgs = await listUserOrgs(userId);
    return c.json(orgs);
  })

  // POST /admin/me/bootstrap — create default org + admin membership if user has none (first sign-in)
  .post("/me/bootstrap", async (c) => {
    const userId = c.get("userId");
    try {
      let name: string | undefined;
      try {
        const body = await c.req.json<{ name?: string }>();
        if (body.name && typeof body.name === "string") name = body.name.trim().slice(0, 100);
      } catch {
        /* empty body is fine */
      }
      const { created, orgs } = await bootstrapDefaultOrgIfNeeded(userId, name);
      return c.json({ created, orgs });
    } catch (err: unknown) {
      console.error("[admin/me/bootstrap]", err);
      return c.json(
        { error: "Could not create default organization", code: "BOOTSTRAP_ERROR" },
        500,
      );
    }
  })

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

  // GET /admin/orgs — list orgs the user belongs to
  .get("/orgs", async (c) => {
    const userId = c.get("userId");
    const orgs = await listUserOrgs(userId);
    return c.json(orgs);
  })

  // POST /admin/orgs — create org (auto-adds creator as admin)
  .post("/orgs", async (c) => {
    const userId = c.get("userId");
    const body = await c.req.json().catch(() => ({}));
    const parsed = CreateOrgSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Invalid request body", code: "VALIDATION_ERROR" }, 400);
    }

    const orgCount = await countUserOrgs(userId);
    if (orgCount >= FREE_TIER_ORG_LIMIT) {
      return c.json(
        { error: `Free tier is limited to ${FREE_TIER_ORG_LIMIT} organization`, code: "ORG_LIMIT_REACHED" },
        403,
      );
    }

    const { slug, name } = parsed.data;
    try {
      const org = await createOrg(slug, name);
      await addMember(org.id, userId, null, "admin");
      return c.json(org, 201);
    } catch (err: unknown) {
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

  // GET /admin/orgs/:slug — get single org (requires membership)
  .get("/orgs/:slug", async (c) => {
    const userId = c.get("userId");
    const check = await requireOrgMembership(c.req.param("slug"), userId);
    if ("error" in check) return c.json({ error: check.error.message, code: check.error.code }, check.error.status);
    return c.json({ ...check.org, role: check.role });
  })

  // PATCH /admin/orgs/:slug — update org name/settings (admin only)
  .patch("/orgs/:slug", async (c) => {
    const userId = c.get("userId");
    const check = await requireOrgMembership(c.req.param("slug"), userId, "admin");
    if ("error" in check) return c.json({ error: check.error.message, code: check.error.code }, check.error.status);

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

  // GET /admin/orgs/:slug/stats — org-specific session stats (requires membership)
  .get("/orgs/:slug/stats", async (c) => {
    const userId = c.get("userId");
    const check = await requireOrgMembership(c.req.param("slug"), userId);
    if ("error" in check) return c.json({ error: check.error.message, code: check.error.code }, check.error.status);
    const org = check.org;
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

  // POST /admin/orgs/:slug/signing-secret/rotate (admin only)
  .post("/orgs/:slug/signing-secret/rotate", async (c) => {
    const userId = c.get("userId");
    const check = await requireOrgMembership(c.req.param("slug"), userId, "admin");
    if ("error" in check) return c.json({ error: check.error.message, code: check.error.code }, check.error.status);

    const newSecret = await rotateSigningSecret(c.req.param("slug"));
    if (!newSecret) {
      return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
    }
    return c.json({ signing_secret: newSecret });
  })

  // DELETE /admin/orgs/:slug — soft delete (admin only)
  .delete("/orgs/:slug", async (c) => {
    const userId = c.get("userId");
    const check = await requireOrgMembership(c.req.param("slug"), userId, "admin");
    if ("error" in check) return c.json({ error: check.error.message, code: check.error.code }, check.error.status);

    const deleted = await softDeleteOrg(c.req.param("slug"));
    if (!deleted) {
      return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
    }
    return c.json({ ok: true });
  })

  // POST /admin/orgs/:slug/keys — create API key (admin only)
  .post("/orgs/:slug/keys", async (c) => {
    const userId = c.get("userId");
    const check = await requireOrgMembership(c.req.param("slug"), userId, "admin");
    if ("error" in check) return c.json({ error: check.error.message, code: check.error.code }, check.error.status);

    const body = await c.req.json().catch(() => ({})) as { label?: string };
    const result = await createApiKey(check.org.id, body.label);
    return c.json(result, 201);
  })

  // GET /admin/orgs/:slug/keys — list keys (requires membership)
  .get("/orgs/:slug/keys", async (c) => {
    const userId = c.get("userId");
    const check = await requireOrgMembership(c.req.param("slug"), userId);
    if ("error" in check) return c.json({ error: check.error.message, code: check.error.code }, check.error.status);

    const keys = await listOrgApiKeys(check.org.id);
    return c.json(keys);
  })

  // DELETE /admin/orgs/:slug/keys/:id — revoke key (admin only)
  .delete("/orgs/:slug/keys/:id", async (c) => {
    const userId = c.get("userId");
    const check = await requireOrgMembership(c.req.param("slug"), userId, "admin");
    if ("error" in check) return c.json({ error: check.error.message, code: check.error.code }, check.error.status);

    const revoked = await revokeApiKey(c.req.param("id"), check.org.id);
    if (!revoked) {
      return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
    }
    return c.json({ ok: true });
  })

  // -------------------------------------------------------------------------
  // Team Members
  // -------------------------------------------------------------------------

  // GET /admin/orgs/:slug/members — list org members
  .get("/orgs/:slug/members", async (c) => {
    const userId = c.get("userId");
    const check = await requireOrgMembership(c.req.param("slug"), userId);
    if ("error" in check) return c.json({ error: check.error.message, code: check.error.code }, check.error.status);

    const members = await listOrgMembers(check.org.id);
    return c.json(members);
  })

  // POST /admin/orgs/:slug/members — invite member (admin only)
  .post("/orgs/:slug/members", async (c) => {
    const userId = c.get("userId");
    const check = await requireOrgMembership(c.req.param("slug"), userId, "admin");
    if ("error" in check) return c.json({ error: check.error.message, code: check.error.code }, check.error.status);

    const body = await c.req.json().catch(() => ({}));
    const parsed = AddMemberSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Invalid request body", code: "VALIDATION_ERROR" }, 400);
    }

    const existing = await findMemberByEmail(check.org.id, parsed.data.email);
    if (existing) {
      return c.json({ error: "User is already a member", code: "ALREADY_MEMBER" }, 409);
    }

    const member = await addMember(
      check.org.id,
      `pending_${parsed.data.email}`,
      parsed.data.email,
      parsed.data.role,
      userId,
      "pending",
    );
    return c.json(member, 201);
  })

  // PATCH /admin/orgs/:slug/members/:memberId — update role (admin only)
  .patch("/orgs/:slug/members/:memberId", async (c) => {
    const userId = c.get("userId");
    const check = await requireOrgMembership(c.req.param("slug"), userId, "admin");
    if ("error" in check) return c.json({ error: check.error.message, code: check.error.code }, check.error.status);

    const body = await c.req.json().catch(() => ({}));
    const parsed = UpdateMemberRoleSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Invalid request body", code: "VALIDATION_ERROR" }, 400);
    }

    const targetUserId = c.req.param("memberId");

    if (parsed.data.role === "member") {
      const adminCount = await countOrgAdmins(check.org.id);
      if (adminCount <= 1) {
        const currentRole = await getUserOrgRole(check.org.id, targetUserId);
        if (currentRole === "admin") {
          return c.json({ error: "Cannot demote the last admin", code: "LAST_ADMIN" }, 400);
        }
      }
    }

    const updated = await updateMemberRole(check.org.id, targetUserId, parsed.data.role);
    if (!updated) {
      return c.json({ error: "Member not found", code: "NOT_FOUND" }, 404);
    }
    return c.json(updated);
  })

  // DELETE /admin/orgs/:slug/members/:memberId — remove member (admin only)
  .delete("/orgs/:slug/members/:memberId", async (c) => {
    const userId = c.get("userId");
    const check = await requireOrgMembership(c.req.param("slug"), userId, "admin");
    if ("error" in check) return c.json({ error: check.error.message, code: check.error.code }, check.error.status);

    const targetUserId = c.req.param("memberId");

    if (targetUserId === userId) {
      const adminCount = await countOrgAdmins(check.org.id);
      if (adminCount <= 1) {
        return c.json({ error: "Cannot remove the last admin", code: "LAST_ADMIN" }, 400);
      }
    }

    const removed = await removeMember(check.org.id, targetUserId);
    if (!removed) {
      return c.json({ error: "Member not found", code: "NOT_FOUND" }, 404);
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
