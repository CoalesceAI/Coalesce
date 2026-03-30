import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// Mock pool before importing any route that uses it
vi.mock("../src/db/pool.js", () => ({
  pool: { query: vi.fn() },
}));

// Mock admin-auth to skip Clerk JWT verification
vi.mock("../src/middleware/admin-auth.js", () => ({
  adminAuth: vi.fn(
    async (
      c: { req: { header: (k: string) => string | undefined }; json: (body: unknown, status: number) => Response },
      next: () => Promise<void>,
    ) => {
      if (!c.req.header("Authorization")) {
        return c.json({ error: "Missing authorization header", code: "MISSING_AUTH" }, 401);
      }
      await next();
    },
  ),
}));

// Mock organizations repository
vi.mock("../src/repositories/organizations.js", () => ({
  getOrgBySlug: vi.fn(),
}));

// Mock firecrawl service
vi.mock("../src/services/firecrawl.js", () => ({
  scrapeAndStore: vi.fn(),
}));

const { pool } = await import("../src/db/pool.js");
const mockQuery = vi.mocked(pool.query);

const { getOrgBySlug } = await import("../src/repositories/organizations.js");
const mockGetOrgBySlug = vi.mocked(getOrgBySlug);

const { scrapeAndStore } = await import("../src/services/firecrawl.js");
const mockScrapeAndStore = vi.mocked(scrapeAndStore);

const { knowledgeRoute } = await import("../src/routes/knowledge.js");

const MOCK_ORG = { id: "org-1", slug: "acme", name: "Acme", deleted_at: null };
const AUTH = { Authorization: "Bearer valid.jwt.token" };

function buildApp() {
  const app = new Hono();
  app.route("/admin", knowledgeRoute);
  return app;
}

// ---------------------------------------------------------------------------
// POST /admin/orgs/:slug/docs/url
// ---------------------------------------------------------------------------

describe("POST /admin/orgs/:slug/docs/url", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetOrgBySlug.mockResolvedValue(MOCK_ORG as never);
  });

  it("returns 202 immediately with status=pending", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: "src-1" }] } as never);
    mockScrapeAndStore.mockResolvedValue(undefined);

    const res = await buildApp().request("/admin/orgs/acme/docs/url", {
      method: "POST",
      headers: { ...AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/docs" }),
    });

    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.id).toBe("src-1");
    expect(body.status).toBe("pending");
  });

  it("returns 400 for invalid URL", async () => {
    const res = await buildApp().request("/admin/orgs/acme/docs/url", {
      method: "POST",
      headers: { ...AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({ url: "not-a-url" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 404 for unknown org", async () => {
    mockGetOrgBySlug.mockResolvedValue(null);

    const res = await buildApp().request("/admin/orgs/unknown/docs/url", {
      method: "POST",
      headers: { ...AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com" }),
    });

    expect(res.status).toBe(404);
  });

  it("unauthenticated → 401", async () => {
    const res = await buildApp().request("/admin/orgs/acme/docs/url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com" }),
    });
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /admin/orgs/:slug/docs/:id/status
// ---------------------------------------------------------------------------

describe("GET /admin/orgs/:slug/docs/:id/status", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetOrgBySlug.mockResolvedValue(MOCK_ORG as never);
  });

  it("returns current status for existing source", async () => {
    const lastSync = new Date("2026-01-15T10:00:00Z");
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "src-1", status: "ready", last_sync_at: lastSync, error_message: null }],
    } as never);

    const res = await buildApp().request("/admin/orgs/acme/docs/src-1/status", {
      headers: AUTH,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("src-1");
    expect(body.status).toBe("ready");
    expect(body.error_message).toBeNull();
  });

  it("returns error status with error_message", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "src-2", status: "error", last_sync_at: null, error_message: "Firecrawl timeout" }],
    } as never);

    const res = await buildApp().request("/admin/orgs/acme/docs/src-2/status", {
      headers: AUTH,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("error");
    expect(body.error_message).toBe("Firecrawl timeout");
  });

  it("returns 404 for unknown source", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    const res = await buildApp().request("/admin/orgs/acme/docs/no-such-id/status", {
      headers: AUTH,
    });

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /admin/orgs/:slug/docs/:id/sync
// ---------------------------------------------------------------------------

describe("POST /admin/orgs/:slug/docs/:id/sync", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetOrgBySlug.mockResolvedValue(MOCK_ORG as never);
  });

  it("triggers re-sync and returns 202", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "src-1", source_type: "url_crawl", source_path: "https://example.com/docs" }],
    } as never);
    mockScrapeAndStore.mockResolvedValue(undefined);

    const res = await buildApp().request("/admin/orgs/acme/docs/src-1/sync", {
      method: "POST",
      headers: AUTH,
    });

    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.status).toBe("pending");
  });

  it("returns 400 for non-URL source type", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "src-2", source_type: "file_upload", source_path: "report.pdf" }],
    } as never);

    const res = await buildApp().request("/admin/orgs/acme/docs/src-2/sync", {
      method: "POST",
      headers: AUTH,
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("INVALID_SOURCE_TYPE");
  });

  it("returns 404 for unknown source", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    const res = await buildApp().request("/admin/orgs/acme/docs/no-such/sync", {
      method: "POST",
      headers: AUTH,
    });

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// DELETE /admin/orgs/:slug/docs/:id
// ---------------------------------------------------------------------------

describe("DELETE /admin/orgs/:slug/docs/:id", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetOrgBySlug.mockResolvedValue(MOCK_ORG as never);
  });

  it("deletes source and returns ok", async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "src-1" }] } as never);

    const res = await buildApp().request("/admin/orgs/acme/docs/src-1", {
      method: "DELETE",
      headers: AUTH,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("returns 404 for unknown source", async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] } as never);

    const res = await buildApp().request("/admin/orgs/acme/docs/no-such", {
      method: "DELETE",
      headers: AUTH,
    });

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// GET /admin/orgs/:slug/docs
// ---------------------------------------------------------------------------

describe("GET /admin/orgs/:slug/docs", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetOrgBySlug.mockResolvedValue(MOCK_ORG as never);
  });

  it("returns list of doc sources with content_count", async () => {
    const lastSync = new Date("2026-01-15T10:00:00Z");
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "src-1",
          source_type: "url_crawl",
          source_path: "https://docs.example.com",
          status: "ready",
          last_sync_at: lastSync,
          error_message: null,
          content_count: "3",
        },
      ],
    } as never);

    const res = await buildApp().request("/admin/orgs/acme/docs", {
      headers: AUTH,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe("src-1");
    expect(body[0].content_count).toBe(3);
    expect(body[0].status).toBe("ready");
  });
});
