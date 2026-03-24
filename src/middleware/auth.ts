import { createMiddleware } from "hono/factory";
import type { Tenant } from "../services/tenant.js";
import { validateApiKey } from "../services/tenant.js";

// ---------------------------------------------------------------------------
// Hono variable declarations (available via c.get)
// ---------------------------------------------------------------------------

export type AuthVariables = {
  tenant: Tenant;
  tenantId: string;
};

// ---------------------------------------------------------------------------
// Tenant auth middleware
//
// Expects:
//   - Route param :tenant  (tenant slug)
//   - Authorization: Bearer <api-key>
//
// Sets:
//   c.var.tenant   — full Tenant object
//   c.var.tenantId — tenant UUID shortcut
// ---------------------------------------------------------------------------

export const tenantAuth = createMiddleware<{ Variables: AuthVariables }>(
  async (c, next) => {
    // 1. Extract tenant slug from route param
    const slug = c.req.param("tenant");
    if (!slug) {
      return c.json({ error: "Missing tenant slug", code: "MISSING_TENANT" }, 401);
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

    // 4. Verify the key belongs to the requested tenant
    if (result.tenant.slug !== slug) {
      return c.json(
        { error: "API key does not belong to this tenant", code: "TENANT_MISMATCH" },
        403,
      );
    }

    // 5. Set context variables
    c.set("tenant", result.tenant);
    c.set("tenantId", result.tenant.id);

    await next();
  },
);
