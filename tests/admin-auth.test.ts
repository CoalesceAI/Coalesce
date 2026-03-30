import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';

// Mock @clerk/backend before importing admin-auth
vi.mock('@clerk/backend', () => ({
  verifyToken: vi.fn(),
}));

const { verifyToken } = await import('@clerk/backend');
const mockVerifyToken = vi.mocked(verifyToken);

const { adminAuth } = await import('../src/middleware/admin-auth.js');

function buildTestApp() {
  const app = new Hono();
  app.use('/admin/*', adminAuth);
  app.get('/admin/ping', (c) => c.json({ ok: true }));
  return app;
}

describe('adminAuth middleware', () => {
  it('valid Clerk JWT → next() called', async () => {
    mockVerifyToken.mockResolvedValueOnce({ sub: 'user_123' } as never);
    const app = buildTestApp();
    const res = await app.request('/admin/ping', {
      headers: { Authorization: 'Bearer valid.jwt.token' },
    });
    expect(res.status).toBe(200);
  });

  it('missing Authorization header → 401', async () => {
    const app = buildTestApp();
    const res = await app.request('/admin/ping');
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('MISSING_AUTH');
  });

  it('malformed JWT (not Bearer) → 401', async () => {
    const app = buildTestApp();
    const res = await app.request('/admin/ping', {
      headers: { Authorization: 'Basic dXNlcjpwYXNz' },
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('MISSING_AUTH');
  });

  it('verifyToken throws → 401', async () => {
    mockVerifyToken.mockRejectedValueOnce(new Error('Token expired'));
    const app = buildTestApp();
    const res = await app.request('/admin/ping', {
      headers: { Authorization: 'Bearer expired.jwt.token' },
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('INVALID_TOKEN');
  });

  it('GET /admin/ping with valid JWT → { ok: true }', async () => {
    mockVerifyToken.mockResolvedValueOnce({ sub: 'user_123' } as never);
    const app = buildTestApp();
    const res = await app.request('/admin/ping', {
      headers: { Authorization: 'Bearer valid.jwt.token' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });

  it('GET /admin/ping without auth → 401', async () => {
    const app = buildTestApp();
    const res = await app.request('/admin/ping');
    expect(res.status).toBe(401);
  });
});
