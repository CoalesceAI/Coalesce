import { createMiddleware } from "hono/factory";
import { verifyToken } from "@clerk/backend";

// ---------------------------------------------------------------------------
// Admin auth middleware
//
// Verifies a Clerk JWT from Authorization: Bearer <token>.
// Does NOT set org context — admin routes that need org context call
// getOrgBySlug() directly in the route handler.
// ---------------------------------------------------------------------------

export const adminAuth = createMiddleware(async (c, next) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "Missing authorization header", code: "MISSING_AUTH" }, 401);
  }

  const token = authHeader.slice("Bearer ".length);
  if (!token) {
    return c.json({ error: "Empty token", code: "MISSING_AUTH" }, 401);
  }

  try {
    await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY ?? "",
    });
  } catch {
    return c.json({ error: "Invalid or expired token", code: "INVALID_TOKEN" }, 401);
  }

  await next();
});
