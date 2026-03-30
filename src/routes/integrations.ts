import { Hono } from "hono";
import { z } from "zod";
import { adminAuth } from "../middleware/admin-auth.js";
import { pool } from "../db/pool.js";
import { getOrgBySlug } from "../repositories/organizations.js";
import { listNotionPages, importNotionPage, syncNotionPage } from "../services/notion.js";

// ---------------------------------------------------------------------------
// Integration routes — all require Clerk JWT via adminAuth
//
//   GET    /admin/orgs/:slug/integrations            — list integrations
//   POST   /admin/orgs/:slug/integrations/notion     — connect Notion (access token)
//   DELETE /admin/orgs/:slug/integrations/:provider  — disconnect
//   GET    /admin/orgs/:slug/integrations/notion/pages — list Notion pages
//   POST   /admin/orgs/:slug/docs/notion             — import Notion page
// ---------------------------------------------------------------------------

const ConnectNotionSchema = z.object({
  access_token: z.string().min(1),
});

const ImportNotionPageSchema = z.object({
  page_id: z.string().min(1),
});

async function resolveOrg(slug: string) {
  const org = await getOrgBySlug(slug);
  if (!org || org.deleted_at) return null;
  return org;
}

export const integrationsRoute = new Hono()
  .use("*", adminAuth)

  // GET /admin/orgs/:slug/integrations — list connected integrations
  .get("/orgs/:slug/integrations", async (c) => {
    const org = await resolveOrg(c.req.param("slug"));
    if (!org) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);

    const result = await pool.query<{
      id: string;
      provider: string;
      config: Record<string, unknown>;
      connected_at: Date;
    }>(
      `SELECT id, provider, config, connected_at
       FROM organization_integrations
       WHERE org_id = $1
       ORDER BY connected_at DESC`,
      [org.id],
    );

    return c.json(result.rows);
  })

  // POST /admin/orgs/:slug/integrations/notion — connect Notion
  .post("/orgs/:slug/integrations/notion", async (c) => {
    const org = await resolveOrg(c.req.param("slug"));
    if (!org) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);

    const body = await c.req.json().catch(() => ({}));
    const parsed = ConnectNotionSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "access_token is required", code: "VALIDATION_ERROR" }, 400);
    }

    const result = await pool.query<{ id: string }>(
      `INSERT INTO organization_integrations (org_id, provider, access_token, config)
       VALUES ($1, 'notion', $2, '{}')
       ON CONFLICT (org_id, provider) DO UPDATE SET
         access_token = EXCLUDED.access_token,
         updated_at = now()
       RETURNING id`,
      [org.id, parsed.data.access_token],
    );

    return c.json({ id: result.rows[0]?.id, provider: "notion", connected: true }, 201);
  })

  // DELETE /admin/orgs/:slug/integrations/:provider — disconnect
  .delete("/orgs/:slug/integrations/:provider", async (c) => {
    const org = await resolveOrg(c.req.param("slug"));
    if (!org) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);

    const result = await pool.query(
      `DELETE FROM organization_integrations
       WHERE org_id = $1 AND provider = $2
       RETURNING id`,
      [org.id, c.req.param("provider")],
    );

    if (result.rowCount === 0) {
      return c.json({ error: "Integration not found", code: "NOT_FOUND" }, 404);
    }
    return c.json({ ok: true });
  })

  // GET /admin/orgs/:slug/integrations/notion/pages — list Notion pages
  .get("/orgs/:slug/integrations/notion/pages", async (c) => {
    const org = await resolveOrg(c.req.param("slug"));
    if (!org) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);

    const integration = await pool.query<{ access_token: string }>(
      `SELECT access_token FROM organization_integrations
       WHERE org_id = $1 AND provider = 'notion'`,
      [org.id],
    );

    if (!integration.rows[0]) {
      return c.json({ error: "Notion not connected", code: "NOT_CONNECTED" }, 400);
    }

    const pages = await listNotionPages(integration.rows[0].access_token);
    return c.json(pages);
  })

  // POST /admin/orgs/:slug/docs/notion — import a Notion page
  .post("/orgs/:slug/docs/notion", async (c) => {
    const org = await resolveOrg(c.req.param("slug"));
    if (!org) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);

    const body = await c.req.json().catch(() => ({}));
    const parsed = ImportNotionPageSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "page_id is required", code: "VALIDATION_ERROR" }, 400);
    }

    const integration = await pool.query<{ id: string; access_token: string }>(
      `SELECT id, access_token FROM organization_integrations
       WHERE org_id = $1 AND provider = 'notion'`,
      [org.id],
    );

    if (!integration.rows[0]) {
      return c.json({ error: "Notion not connected", code: "NOT_CONNECTED" }, 400);
    }

    try {
      const result = await importNotionPage(
        integration.rows[0].access_token,
        parsed.data.page_id,
        org.id,
        integration.rows[0].id,
      );
      return c.json(result, 201);
    } catch (err) {
      return c.json({
        error: err instanceof Error ? err.message : "Import failed",
        code: "IMPORT_ERROR",
      }, 400);
    }
  });
