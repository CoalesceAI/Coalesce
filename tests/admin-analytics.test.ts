import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

// Mock pool before importing any route that uses it
vi.mock('../src/db/pool.js', () => ({
  pool: { query: vi.fn() },
}));

// Mock adminAuth to a simplified check — verifies Authorization header
// is present but skips Clerk JWT verification. The real JWT middleware
// is covered by admin-auth.test.ts.
vi.mock('../src/middleware/admin-auth.js', () => ({
  adminAuth: vi.fn(async (c: { req: { header: (k: string) => string | undefined }, json: (body: unknown, status: number) => Response }, next: () => Promise<void>) => {
    if (!c.req.header('Authorization')) {
      return c.json({ error: 'Missing authorization header', code: 'MISSING_AUTH' }, 401);
    }
    await next();
  }),
}));

const { pool } = await import('../src/db/pool.js');
const mockQuery = vi.mocked(pool.query);

const { adminRoute } = await import('../src/routes/admin.js');

function buildApp() {
  const app = new Hono();
  app.route('/admin', adminRoute);
  return app;
}

// ---------------------------------------------------------------------------
// GET /admin/stats
// ---------------------------------------------------------------------------

describe('GET /admin/stats', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('correct totals when sessions exist', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        total: '10',
        resolved: '5',
        needs_info: '2',
        unknown: '1',
        active: '2',
        avg_resolution_ms: '3500.5',
        last_24h_count: '3',
        last_7d_count: '8',
      }],
    } as never);

    const res = await buildApp().request('/admin/stats', {
      headers: { Authorization: 'Bearer valid.jwt.token' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(10);
    expect(body.resolved).toBe(5);
    expect(body.needs_info).toBe(2);
    expect(body.unknown).toBe(1);
    expect(body.active).toBe(2);
    expect(body.avg_resolution_ms).toBe(3500.5);
    expect(body.last_24h_count).toBe(3);
    expect(body.last_7d_count).toBe(8);
  });

  it('avg_resolution_ms is null when no resolved sessions', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        total: '5',
        resolved: '0',
        needs_info: '0',
        unknown: '0',
        active: '5',
        avg_resolution_ms: null,
        last_24h_count: '5',
        last_7d_count: '5',
      }],
    } as never);

    const res = await buildApp().request('/admin/stats', {
      headers: { Authorization: 'Bearer valid.jwt.token' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.avg_resolution_ms).toBeNull();
    expect(body.resolved).toBe(0);
  });

  it('all zeros on empty DB', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        total: '0',
        resolved: '0',
        needs_info: '0',
        unknown: '0',
        active: '0',
        avg_resolution_ms: null,
        last_24h_count: '0',
        last_7d_count: '0',
      }],
    } as never);

    const res = await buildApp().request('/admin/stats', {
      headers: { Authorization: 'Bearer valid.jwt.token' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(0);
    expect(body.resolved).toBe(0);
    expect(body.needs_info).toBe(0);
    expect(body.unknown).toBe(0);
    expect(body.active).toBe(0);
    expect(body.avg_resolution_ms).toBeNull();
    expect(body.last_24h_count).toBe(0);
    expect(body.last_7d_count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// GET /admin/sessions
// ---------------------------------------------------------------------------

describe('GET /admin/sessions', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('paginated correctly (offset=0)', async () => {
    const now = new Date();
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          { id: 'sess-1', org_id: 'org-1', external_customer_id: null, status: 'active', created_at: now, resolved_at: null, turn_count: '2' },
          { id: 'sess-2', org_id: 'org-1', external_customer_id: null, status: 'resolved', created_at: now, resolved_at: now, turn_count: '4' },
        ],
      } as never)
      .mockResolvedValueOnce({ rows: [{ total: '10' }] } as never);

    const res = await buildApp().request('/admin/sessions?limit=2&offset=0', {
      headers: { Authorization: 'Bearer valid.jwt.token' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessions).toHaveLength(2);
    expect(body.sessions[0].id).toBe('sess-1');
    expect(body.sessions[1].turn_count).toBe(4);
    expect(body.total).toBe(10);
    expect(body.offset).toBe(0);
    expect(body.limit).toBe(2);
  });

  it('paginated correctly (offset=N)', async () => {
    const now = new Date();
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          { id: 'sess-3', org_id: 'org-1', external_customer_id: null, status: 'active', created_at: now, resolved_at: null, turn_count: '1' },
        ],
      } as never)
      .mockResolvedValueOnce({ rows: [{ total: '10' }] } as never);

    const res = await buildApp().request('/admin/sessions?limit=1&offset=2', {
      headers: { Authorization: 'Bearer valid.jwt.token' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessions).toHaveLength(1);
    expect(body.sessions[0].id).toBe('sess-3');
    expect(body.offset).toBe(2);
    expect(body.limit).toBe(1);
  });

  it('unauthenticated → 401', async () => {
    const res = await buildApp().request('/admin/sessions');
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('MISSING_AUTH');
  });
});

// ---------------------------------------------------------------------------
// GET /admin/sessions/:id
// ---------------------------------------------------------------------------

describe('GET /admin/sessions/:id', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns turns[] for existing session', async () => {
    const now = new Date();
    const turns = [
      { role: 'user', content: 'My API is returning 400' },
      { role: 'assistant', content: 'Check the request body schema.' },
    ];
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'sess-1',
        org_id: 'org-1',
        external_customer_id: null,
        turns,
        original_request: { endpoint: '/api/v1/data', error_code: '400' },
        status: 'active',
        created_at: now,
        resolved_at: null,
      }],
    } as never);

    const res = await buildApp().request('/admin/sessions/sess-1', {
      headers: { Authorization: 'Bearer valid.jwt.token' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe('sess-1');
    expect(body.turns).toHaveLength(2);
    expect(body.turns[0].role).toBe('user');
    expect(body.turns[1].role).toBe('assistant');
  });

  it('404 for unknown id', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    const res = await buildApp().request('/admin/sessions/does-not-exist', {
      headers: { Authorization: 'Bearer valid.jwt.token' },
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe('SESSION_NOT_FOUND');
  });
});
