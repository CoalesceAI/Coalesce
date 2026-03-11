import { describe, it, expect } from 'vitest';
import { healthRoute } from '../src/routes/health.js';
import { Hono } from 'hono';

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

  it('returns { status: "ok" }', async () => {
    const app = buildTestApp();
    const res = await app.request('/health');
    const body = await res.json();
    expect(body.status).toBe('ok');
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
