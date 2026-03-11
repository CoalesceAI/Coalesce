import { describe, it, expect } from 'vitest';
import { supportRoute } from '../src/routes/support.js';
import { Hono } from 'hono';

// Build a test app with the supportRoute factory
function buildTestApp() {
  const app = new Hono();
  app.route('/support', supportRoute(''));
  return app;
}

describe('POST /support', () => {
  it('returns 200 with status field for valid request', async () => {
    const app = buildTestApp();
    const res = await app.request('/support', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: '/threads', error_code: '404' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('status');
  });

  it('returns 400 with { error, code } for empty body', async () => {
    const app = buildTestApp();
    const res = await app.request('/support', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty('error');
    expect(body).toHaveProperty('code');
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for missing required fields', async () => {
    const app = buildTestApp();
    const res = await app.request('/support', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: '/threads' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for non-JSON content type', async () => {
    const app = buildTestApp();
    const res = await app.request('/support', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'not json',
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty('error');
    expect(body).toHaveProperty('code');
  });

  it('returns Content-Type application/json', async () => {
    const app = buildTestApp();
    const res = await app.request('/support', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: '/threads', error_code: '404' }),
    });
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  it('stub response includes status field with value', async () => {
    const app = buildTestApp();
    const res = await app.request('/support', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: '/threads',
        error_code: '404',
        request_body: { id: 'test' },
        context: 'User reports thread not found',
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(['resolved', 'needs_info', 'unknown', 'error']).toContain(body.status);
  });
});
