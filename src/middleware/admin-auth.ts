import { createMiddleware } from "hono/factory";
import { verifyToken } from "@clerk/backend";

// ---------------------------------------------------------------------------
// Admin auth middleware
//
// Verifies a Clerk JWT from Authorization: Bearer <token>.
// Extracts the Clerk user ID (sub claim) and stores it on the context.
// ---------------------------------------------------------------------------

export type AdminAuthEnv = {
  Variables: {
    userId: string;
    userEmail?: string;
  };
};

export const adminAuth = createMiddleware<AdminAuthEnv>(async (c, next) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "Missing authorization header", code: "MISSING_AUTH" }, 401);
  }

  const token = authHeader.slice("Bearer ".length);
  if (!token) {
    return c.json({ error: "Empty token", code: "MISSING_AUTH" }, 401);
  }

  try {
    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY ?? "",
    });
    c.set("userId", payload.sub);
  } catch {
    return c.json({ error: "Invalid or expired token", code: "INVALID_TOKEN" }, 401);
  }

  await next();
});
