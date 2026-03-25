import { createMiddleware } from "hono/factory";
import type { Organization } from "../domain/organization.js";
import { validateApiKey } from "../repositories/api-keys.js";

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
// Expects:
//   - Route param :org  (organization slug)
//   - Authorization: Bearer <api-key>
//
// Sets:
//   c.var.org    — full Organization object
//   c.var.orgId  — organization UUID shortcut
// ---------------------------------------------------------------------------

export const orgAuth = createMiddleware<{ Variables: AuthVariables }>(
  async (c, next) => {
    // 1. Extract organization slug from route param
    const slug = c.req.param("org");
    if (!slug) {
      return c.json({ error: "Missing organization slug", code: "MISSING_ORG" }, 401);
    }

    // 2. Extract Bearer token
    const authHeader = c.req.header("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return c.json(
        { error: "Missing or malformed Authorization header", code: "MISSING_AUTH" },
        401,
      );
    }
    const token = authHeader.slice("Bearer ".length);

    if (!token) {
      return c.json({ error: "Empty API key", code: "INVALID_KEY" }, 401);
    }

    // 3. Validate the API key
    const result = await validateApiKey(token);
    if (!result) {
      return c.json({ error: "Invalid or revoked API key", code: "INVALID_KEY" }, 401);
    }

    // 4. Verify the key belongs to the requested organization
    if (result.org.slug !== slug) {
      return c.json(
        { error: "API key does not belong to this organization", code: "ORG_MISMATCH" },
        403,
      );
    }

    // 5. Set context variables
    c.set("org", result.org);
    c.set("orgId", result.org.id);

    await next();
  },
);
