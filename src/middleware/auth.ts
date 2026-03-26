import { createMiddleware } from "hono/factory";
import type { Organization } from "../domain/organization.js";
import { verifySignedUrl } from "../domain/signed-url.js";
import { validateApiKey } from "../repositories/api-keys.js";
import { getOrgBySlug } from "../repositories/organizations.js";

// ---------------------------------------------------------------------------
// Hono variable declarations (available via c.get)
// ---------------------------------------------------------------------------

export type AuthVariables = {
  org: Organization;
  orgId: string;
};

// ---------------------------------------------------------------------------
// Organization auth middleware
//
// Accepts EITHER:
//   1. Authorization: Bearer <api-key>  (standard API key auth)
//   2. ?token=<hmac>&expires=<timestamp> (signed URL — no auth header needed)
//
// Sets:
//   c.var.org    — full Organization object
//   c.var.orgId  — organization UUID shortcut
// ---------------------------------------------------------------------------

export const orgAuth = createMiddleware<{ Variables: AuthVariables }>(
  async (c, next) => {
    const slug = c.req.param("org");
    if (!slug) {
      return c.json({ error: "Missing organization slug", code: "MISSING_ORG" }, 401);
    }

    // Try signed URL first (token + expires in query params)
    const token = c.req.query("token");
    const expires = c.req.query("expires");

    if (token && expires) {
      // Signed URL auth — look up org to get signing secret
      const org = await getOrgBySlug(slug);
      if (!org) {
        return c.json({ error: "Organization not found", code: "ORG_NOT_FOUND" }, 404);
      }

      const valid = verifySignedUrl(slug, token, expires, org.signing_secret);
      if (!valid) {
        return c.json({ error: "Invalid or expired signed URL", code: "INVALID_TOKEN" }, 401);
      }

      c.set("org", org);
      c.set("orgId", org.id);
      return next();
    }

    // Fall back to Bearer token auth
    const authHeader = c.req.header("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return c.json(
        { error: "Missing authentication. Provide Authorization: Bearer <key> or use a signed URL with ?token=&expires=", code: "MISSING_AUTH" },
        401,
      );
    }
    const apiKey = authHeader.slice("Bearer ".length);

    if (!apiKey) {
      return c.json({ error: "Empty API key", code: "INVALID_KEY" }, 401);
    }

    const result = await validateApiKey(apiKey);
    if (!result) {
      return c.json({ error: "Invalid or revoked API key", code: "INVALID_KEY" }, 401);
    }

    if (result.org.slug !== slug) {
      return c.json(
        { error: "API key does not belong to this organization", code: "ORG_MISMATCH" },
        403,
      );
    }

    c.set("org", result.org);
    c.set("orgId", result.org.id);

    await next();
  },
);
