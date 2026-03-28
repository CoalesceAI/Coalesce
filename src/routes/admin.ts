import { Hono } from "hono";
import { z } from "zod";
import { adminAuth } from "../middleware/admin-auth.js";
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
// Admin org management routes
// All routes require a valid Clerk JWT via adminAuth middleware.
// ---------------------------------------------------------------------------

const CreateOrgSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
});

export const adminRoute = new Hono()
  .use("*", adminAuth)

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
