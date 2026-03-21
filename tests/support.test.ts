import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { supportRoute } from '../src/routes/support.js';
import { InMemorySessionStore } from '../src/services/session-store.js';
import { Hono } from 'hono';

// ---------------------------------------------------------------------------
// Mock the diagnosis service so support.test.ts never calls real Claude API
// ---------------------------------------------------------------------------

vi.mock('../src/services/diagnosis.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/diagnosis.js')>();
  return {
    ...actual,
    diagnose: vi.fn().mockResolvedValue({
      response: {
        status: 'unknown',
        explanation: 'Mock diagnosis response',
      },
      assistantContent: 'Mock diagnosis response',
    }),
  };
});

// Build a test app with the supportRoute factory
let store: InMemorySessionStore;

function buildTestApp() {
  store = new InMemorySessionStore();
  const app = new Hono();
  app.route('/support', supportRoute('', store));
  return app;
}

afterEach(() => {
  store?.destroy();
});

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

  it('response includes status field with valid value', async () => {
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

  it('returns 500 when diagnosis service returns error status', async () => {
    const { diagnose } = await import('../src/services/diagnosis.js');
    vi.mocked(diagnose).mockResolvedValueOnce({
      response: {
        status: 'error',
        message: 'Claude API unavailable',
        code: 'CLAUDE_ERROR',
      },
      assistantContent: 'Claude API unavailable',
    });
    const app = buildTestApp();
    const res = await app.request('/support', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: '/threads', error_code: '503' }),
    });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.status).toBe('error');
    expect(body.code).toBe('CLAUDE_ERROR');
  });
});

// ---------------------------------------------------------------------------
// Session management tests
// ---------------------------------------------------------------------------

describe('POST /support — session management', () => {
  it('initial request returns response with session_id (string) and turn_number (1)', async () => {
    const app = buildTestApp();
    const res = await app.request('/support', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: '/threads', error_code: '401' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.session_id).toBe('string');
    expect(body.session_id.length).toBeGreaterThan(0);
    expect(body.turn_number).toBe(1);
  });

  it('follow-up with valid session_id returns response with same session_id and turn_number 2', async () => {
    const { diagnose } = await import('../src/services/diagnosis.js');

    // Mock needs_info for initial request
    vi.mocked(diagnose).mockResolvedValueOnce({
      response: {
        status: 'needs_info',
        question: 'What auth method are you using?',
      },
      assistantContent: 'What auth method are you using?',
    });

    const app = buildTestApp();

    // Initial request
    const res1 = await app.request('/support', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: '/threads', error_code: '401' }),
    });
    const body1 = await res1.json();
    const sessionId = body1.session_id as string;

    // Mock unknown for follow-up
    vi.mocked(diagnose).mockResolvedValueOnce({
      response: {
        status: 'unknown',
        explanation: 'Follow-up response',
      },
      assistantContent: 'Follow-up response',
    });

    // Follow-up request
    const res2 = await app.request('/support', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        answer: { clarifications: { 'What auth method?': 'Bearer token' } },
      }),
    });
    expect(res2.status).toBe(200);
    const body2 = await res2.json();
    expect(body2.session_id).toBe(sessionId);
    expect(body2.turn_number).toBe(2);
  });

  it('follow-up with invalid session_id returns 404 + SESSION_NOT_FOUND', async () => {
    const app = buildTestApp();
    const res = await app.request('/support', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: '550e8400-e29b-41d4-a716-446655440000',
        answer: { clarifications: { question: 'answer' } },
      }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Session not found');
    expect(body.code).toBe('SESSION_NOT_FOUND');
  });

  it('follow-up with expired session_id returns 404 + SESSION_NOT_FOUND', async () => {
    const { diagnose } = await import('../src/services/diagnosis.js');

    // Use very short TTL store (1ms)
    const shortTtlStore = new InMemorySessionStore(1);

    vi.mocked(diagnose).mockResolvedValueOnce({
      response: {
        status: 'needs_info',
        question: 'What auth method are you using?',
      },
      assistantContent: 'What auth method are you using?',
    });

    const app = new Hono();
    app.route('/support', supportRoute('', shortTtlStore));

    // Create initial session
    const res1 = await app.request('/support', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: '/threads', error_code: '401' }),
    });
    const body1 = await res1.json();
    const sessionId = body1.session_id as string;

    // Wait for TTL to expire
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Follow-up with expired session
    const res2 = await app.request('/support', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        answer: { clarifications: { question: 'answer' } },
      }),
    });
    expect(res2.status).toBe(404);
    const body2 = await res2.json();
    expect(body2.code).toBe('SESSION_NOT_FOUND');

    shortTtlStore.destroy();
  });

  it('two concurrent sessions with different IDs do not interfere', async () => {
    const { diagnose } = await import('../src/services/diagnosis.js');
    const app = buildTestApp();

    // Create session A
    vi.mocked(diagnose).mockResolvedValueOnce({
      response: { status: 'needs_info', question: 'Question for A?' },
      assistantContent: 'Question for A?',
    });
    const resA1 = await app.request('/support', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: '/threads', error_code: '401' }),
    });
    const bodyA1 = await resA1.json();
    const sessionIdA = bodyA1.session_id as string;

    // Create session B
    vi.mocked(diagnose).mockResolvedValueOnce({
      response: { status: 'needs_info', question: 'Question for B?' },
      assistantContent: 'Question for B?',
    });
    const resB1 = await app.request('/support', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: '/messages', error_code: '403' }),
    });
    const bodyB1 = await resB1.json();
    const sessionIdB = bodyB1.session_id as string;

    // Both sessions should have different IDs
    expect(sessionIdA).not.toBe(sessionIdB);

    // Follow up on session A
    vi.mocked(diagnose).mockResolvedValueOnce({
      response: { status: 'unknown', explanation: 'Response for A turn 2' },
      assistantContent: 'Response for A turn 2',
    });
    const resA2 = await app.request('/support', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionIdA,
        answer: { clarifications: { 'For A?': 'Yes' } },
      }),
    });
    const bodyA2 = await resA2.json();
    expect(bodyA2.session_id).toBe(sessionIdA);
    expect(bodyA2.turn_number).toBe(2);

    // Follow up on session B — still valid, not affected by A
    vi.mocked(diagnose).mockResolvedValueOnce({
      response: { status: 'unknown', explanation: 'Response for B turn 2' },
      assistantContent: 'Response for B turn 2',
    });
    const resB2 = await app.request('/support', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionIdB,
        answer: { clarifications: { 'For B?': 'Yes' } },
      }),
    });
    const bodyB2 = await resB2.json();
    expect(bodyB2.session_id).toBe(sessionIdB);
    expect(bodyB2.turn_number).toBe(2);
  });
});
