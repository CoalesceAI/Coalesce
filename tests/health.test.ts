import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';

// Mock the DB pool before importing healthRoute
vi.mock('../src/db/pool.js', () => ({
  query: vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }),
  pool: { on: vi.fn() },
}));

// Dynamic import after mock is set up
const { healthRoute } = await import('../src/routes/health.js');
const { query } = await import('../src/db/pool.js');
const mockQuery = vi.mocked(query);

// Build a test app that mounts the healthRoute
function buildTestApp() {
  const app = new Hono();
  app.route('/health', healthRoute);
  return app;
}

describe('GET /health', () => {
  it('returns 200 status', async () => {
    const app = buildTestApp();
    const res = await app.request('/health');
    expect(res.status).toBe(200);
  });

  it('returns { status: "ok" } when DB is connected', async () => {
    const app = buildTestApp();
    const res = await app.request('/health');
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.database).toBe('connected');
  });

  it('returns { status: "degraded" } when DB is down', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection refused'));
    const app = buildTestApp();
    const res = await app.request('/health');
    const body = await res.json();
    expect(body.status).toBe('degraded');
    expect(body.database).toBe('disconnected');
  });

  it('returns uptime as a number', async () => {
    const app = buildTestApp();
    const res = await app.request('/health');
    const body = await res.json();
    expect(typeof body.uptime).toBe('number');
    expect(body.uptime).toBeGreaterThanOrEqual(0);
  });

  it('returns Content-Type application/json', async () => {
    const app = buildTestApp();
    const res = await app.request('/health');
    expect(res.headers.get('content-type')).toContain('application/json');
  });
});
