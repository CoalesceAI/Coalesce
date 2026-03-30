import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { Context } from 'hono';

// ---------------------------------------------------------------------------
// Mock pool — all DB calls go through query()
// ---------------------------------------------------------------------------

const mockQuery = vi.fn();
vi.mock('../src/db/pool.js', () => ({
  query: mockQuery,
  pool: {},
}));

// ---------------------------------------------------------------------------
// Mock admin-auth — bypass Clerk JWT verification, set userId
// ---------------------------------------------------------------------------

vi.mock('../src/middleware/admin-auth.js', () => ({
  adminAuth: vi.fn(async (c: Context, next: () => Promise<void>) => {
    c.set('userId', 'test-user-1');
    await next();
  }),
}));

// ---------------------------------------------------------------------------
// Import route after mocks are set up
// ---------------------------------------------------------------------------

const { adminRoute } = await import('../src/routes/admin.js');

function buildTestApp() {
  const app = new Hono();
  app.route('/admin', adminRoute);
  return app;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fakeOrg(overrides?: object) {
  return {
    id: 'org-1',
    slug: 'acme',
    name: 'Acme',
    settings: {},
    signing_secret: 'sec',
    created_at: new Date('2026-01-01'),
    updated_at: new Date('2026-01-01'),
    deleted_at: null,
    ...overrides,
  };
}

function mockMembershipCheck(role: 'admin' | 'member' = 'admin') {
  mockQuery.mockResolvedValueOnce({ rows: [{ role }], rowCount: 1 });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /admin/orgs', () => {
  beforeEach(() => mockQuery.mockReset());

  it('valid { name, slug } → 201 + org object', async () => {
    const org = fakeOrg();
    // countUserOrgs
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });
    // createOrg INSERT
    mockQuery.mockResolvedValueOnce({ rows: [org], rowCount: 1 });
    // addMember INSERT
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'mem-1', org_id: 'org-1', user_id: 'test-user-1', email: null, role: 'admin', status: 'active', invited_by: null, created_at: new Date(), updated_at: new Date() }],
      rowCount: 1,
    });

    const app = buildTestApp();
    const res = await app.request('/admin/orgs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'acme', name: 'Acme' }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.slug).toBe('acme');
    expect(body.name).toBe('Acme');
  });

  it('duplicate slug → 409', async () => {
    // countUserOrgs
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });
    // createOrg throws unique violation
    const pgError = Object.assign(new Error('duplicate key'), { code: '23505' });
    mockQuery.mockRejectedValueOnce(pgError);

    const app = buildTestApp();
    const res = await app.request('/admin/orgs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'acme', name: 'Acme' }),
    });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('DUPLICATE_SLUG');
  });

  it('missing name → 400', async () => {
    const app = buildTestApp();
    const res = await app.request('/admin/orgs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'acme' }),
    });

    expect(res.status).toBe(400);
  });

  it('free tier limit reached → 403', async () => {
    // countUserOrgs returns 1 (at limit)
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 });

    const app = buildTestApp();
    const res = await app.request('/admin/orgs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'second', name: 'Second' }),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('ORG_LIMIT_REACHED');
  });
});

describe('POST /admin/orgs/:slug/keys', () => {
  beforeEach(() => mockQuery.mockReset());

  it('returns rawKey in response body (only time it is shown)', async () => {
    const org = fakeOrg();
    // getOrgBySlug
    mockQuery.mockResolvedValueOnce({ rows: [org], rowCount: 1 });
    // getUserOrgRole
    mockMembershipCheck('admin');
    // createApiKey INSERT query
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'key-1' }], rowCount: 1 });

    const app = buildTestApp();
    const res = await app.request('/admin/orgs/acme/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(201);
    const body = await res.json() as { rawKey?: string; id?: string; prefix?: string };
    expect(typeof body.rawKey).toBe('string');
    expect(body.rawKey).toMatch(/^clsc_live_/);
    expect(body.id).toBe('key-1');
  });
});

describe('GET /admin/orgs/:slug/keys', () => {
  beforeEach(() => mockQuery.mockReset());

  it('does NOT include rawKey — only prefix, id, created_at, revoked_at', async () => {
    const org = fakeOrg();
    const keys = [
      { id: 'key-1', prefix: 'clsc_live_abc1', label: 'default', created_at: new Date(), revoked_at: null },
    ];
    // getOrgBySlug
    mockQuery.mockResolvedValueOnce({ rows: [org], rowCount: 1 });
    // getUserOrgRole
    mockMembershipCheck();
    // listOrgApiKeys
    mockQuery.mockResolvedValueOnce({ rows: keys, rowCount: 1 });

    const app = buildTestApp();
    const res = await app.request('/admin/orgs/acme/keys');

    expect(res.status).toBe(200);
    const body = await res.json() as Array<Record<string, unknown>>;
    expect(Array.isArray(body)).toBe(true);
    expect(body[0]).not.toHaveProperty('rawKey');
    expect(body[0]).toHaveProperty('id');
    expect(body[0]).toHaveProperty('prefix');
    expect(body[0]).toHaveProperty('created_at');
    expect(body[0]).toHaveProperty('revoked_at');
  });

  it('non-member gets 403', async () => {
    const org = fakeOrg();
    // getOrgBySlug
    mockQuery.mockResolvedValueOnce({ rows: [org], rowCount: 1 });
    // getUserOrgRole — no membership
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const app = buildTestApp();
    const res = await app.request('/admin/orgs/acme/keys');

    expect(res.status).toBe(403);
  });
});

describe('DELETE /admin/orgs/:slug/keys/:id', () => {
  beforeEach(() => mockQuery.mockReset());

  it('sets revoked_at — returns ok', async () => {
    const org = fakeOrg();
    // getOrgBySlug
    mockQuery.mockResolvedValueOnce({ rows: [org], rowCount: 1 });
    // getUserOrgRole
    mockMembershipCheck('admin');
    // revokeApiKey UPDATE
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const app = buildTestApp();
    const res = await app.request('/admin/orgs/acme/keys/key-1', {
      method: 'DELETE',
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);

    const updateCall = mockQuery.mock.calls.find(
      (call) => typeof call[0] === 'string' && call[0].includes('revoked_at'),
    );
    expect(updateCall).toBeDefined();
    expect(updateCall![1]).toContain('key-1');
    expect(updateCall![1]).toContain('org-1');
  });
});

describe('Regression: revoked key → 401', () => {
  beforeEach(() => mockQuery.mockReset());

  it('validateApiKey with revoked key returns null', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const { validateApiKey } = await import('../src/repositories/api-keys.js');
    const result = await validateApiKey('clsc_live_revokedkey');
    expect(result).toBeNull();
  });
});
