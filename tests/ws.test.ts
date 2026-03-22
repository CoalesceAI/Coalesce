import { describe, it, expect, vi, beforeAll, beforeEach, afterAll, afterEach } from 'vitest';
import { Hono } from 'hono';
import WebSocket from 'ws';
import { createNodeWebSocket } from '@hono/node-ws';
import { serve } from '@hono/node-server';
import { wsRoute, connections } from '../src/routes/ws.js';
import { InMemorySessionStore } from '../src/services/session-store.js';

// ---------------------------------------------------------------------------
// Mock the diagnosis service — never call real Claude API in tests
// ---------------------------------------------------------------------------

vi.mock('../src/services/diagnosis.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/diagnosis.js')>();
  return {
    ...actual,
    diagnose: vi.fn().mockResolvedValue({
      response: {
        status: 'resolved',
        diagnosis: 'mock diagnosis',
        fix: 'mock fix',
        references: ['mock-ref'],
        fix_steps: [],
      },
      assistantContent: 'mock fix',
    }),
  };
});

// ---------------------------------------------------------------------------
// Test server setup — mirrors production index.ts pattern
// ---------------------------------------------------------------------------

let serverPort: number;
let store: InMemorySessionStore;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let testServer: any;

// Track open connections per test for cleanup
const testConnections: WebSocket[] = [];

beforeAll(async () => {
  store = new InMemorySessionStore();

  const app = new Hono();
  const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });
  app.route('/', wsRoute('', store, upgradeWebSocket));

  await new Promise<void>((resolve) => {
    testServer = serve({ fetch: app.fetch, port: 0 }, (info) => {
      serverPort = info.port;
      resolve();
    });
    injectWebSocket(testServer);
  });
});

afterAll(async () => {
  store.destroy();
  await new Promise<void>((resolve, reject) => {
    testServer.close((err?: Error) => (err ? reject(err) : resolve()));
  });
});

beforeEach(async () => {
  // Clear mock call history between tests
  const { diagnose } = await import('../src/services/diagnosis.js');
  vi.mocked(diagnose).mockClear();
});

afterEach(async () => {
  // Close any connections opened in this test
  const closePromises = testConnections.map(
    (ws) =>
      new Promise<void>((resolve) => {
        if (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
          resolve();
          return;
        }
        ws.once('close', () => resolve());
        ws.close();
      })
  );
  await Promise.all(closePromises);
  testConnections.length = 0;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function wsUrl(path: string): string {
  return `ws://localhost:${serverPort}${path}`;
}

/**
 * Open a WebSocket connection and return both the WS instance and a promise
 * that resolves with the FIRST message received (the initial diagnosis).
 *
 * Setting up the message listener BEFORE waiting for open ensures we never
 * miss a message that arrives immediately after the upgrade completes.
 */
function connectAndReceiveFirst(
  path: string
): Promise<{ ws: WebSocket; firstMsg: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl(path));
    testConnections.push(ws);

    const msgTimer = setTimeout(
      () => reject(new Error('Timeout waiting for initial message')),
      8000
    );

    ws.once('message', (data) => {
      clearTimeout(msgTimer);
      resolve({ ws, firstMsg: JSON.parse(String(data)) as Record<string, unknown> });
    });

    ws.on('unexpected-response', (_req, res) => {
      clearTimeout(msgTimer);
      reject(new Error(`HTTP ${res.statusCode}`));
    });

    ws.on('error', (err) => {
      clearTimeout(msgTimer);
      reject(err);
    });
  });
}

/**
 * Wait for the next message on an already-open WebSocket.
 */
function nextMessage(ws: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Timeout waiting for message')),
      8000
    );
    ws.once('message', (data) => {
      clearTimeout(timer);
      resolve(JSON.parse(String(data)) as Record<string, unknown>);
    });
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WebSocket /ws/:tenant', () => {
  it(
    'establishes connection and receives initial diagnosis (WS-01, WS-02, WS-03)',
    async () => {
      const { ws, firstMsg } = await connectAndReceiveFirst(
        '/ws/agentmail?endpoint=/v1/threads&error_code=400'
      );

      expect(typeof firstMsg['session_id']).toBe('string');
      expect((firstMsg['session_id'] as string).length).toBeGreaterThan(0);
      expect(firstMsg['turn_number']).toBe(1);
      expect(firstMsg['status']).toBe('resolved');

      // Verify diagnose was called with correct params
      const { diagnose } = await import('../src/services/diagnosis.js');
      expect(vi.mocked(diagnose)).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: '/v1/threads',
          error_code: '400',
        }),
        '',
        []
      );

      ws.close();
    },
    10_000
  );

  it(
    'rejects connection missing endpoint — receives HTTP 400 (WS-01, WS-02)',
    async () => {
      const result = await new Promise<Error>((resolve, reject) => {
        const ws = new WebSocket(wsUrl('/ws/agentmail?error_code=400'));
        testConnections.push(ws);
        ws.on('unexpected-response', (_req, res) => {
          resolve(new Error(`HTTP ${res.statusCode}`));
        });
        ws.on('error', reject);
      });
      expect(result.message).toContain('400');
    },
    10_000
  );

  it(
    'rejects connection missing error_code — receives HTTP 400 (WS-01, WS-02)',
    async () => {
      const result = await new Promise<Error>((resolve, reject) => {
        const ws = new WebSocket(wsUrl('/ws/agentmail?endpoint=/v1/threads'));
        testConnections.push(ws);
        ws.on('unexpected-response', (_req, res) => {
          resolve(new Error(`HTTP ${res.statusCode}`));
        });
        ws.on('error', reject);
      });
      expect(result.message).toContain('400');
    },
    10_000
  );

  it(
    'accepts follow-up messages and returns turn_number 2 (WS-04)',
    async () => {
      const { ws, firstMsg } = await connectAndReceiveFirst(
        '/ws/agentmail?endpoint=/v1/threads&error_code=401'
      );
      const sessionId = firstMsg['session_id'] as string;
      expect(firstMsg['turn_number']).toBe(1);

      // Send follow-up
      ws.send(
        JSON.stringify({
          answer: { clarifications: { 'what SDK?': 'python' } },
        })
      );

      const msg2 = await nextMessage(ws);
      expect(msg2['turn_number']).toBe(2);
      expect(msg2['session_id']).toBe(sessionId);

      // Verify second diagnose call included session context
      const { diagnose } = await import('../src/services/diagnosis.js');
      expect(vi.mocked(diagnose)).toHaveBeenCalledTimes(2);
      const secondCall = vi.mocked(diagnose).mock.calls[1];
      expect(secondCall).toBeDefined();
      if (secondCall !== undefined) {
        // Second call should pass session_id and answer
        expect(secondCall[0]).toMatchObject({
          session_id: sessionId,
          answer: { clarifications: { 'what SDK?': 'python' } },
        });
        // Conversation history is passed — the array was 2 turns at call time.
        // We check it has at least 2 entries (it may be mutated after the call).
        expect(Array.isArray(secondCall[2])).toBe(true);
        expect((secondCall[2] as unknown[]).length).toBeGreaterThanOrEqual(2);
      }

      ws.close();
    },
    10_000
  );

  it(
    'sends error on invalid JSON (WS-03)',
    async () => {
      const { ws } = await connectAndReceiveFirst(
        '/ws/agentmail?endpoint=/v1/threads&error_code=500'
      );

      ws.send('not json{{');

      const errMsg = await nextMessage(ws);
      expect(errMsg['status']).toBe('error');
      expect(errMsg['code']).toBe('INVALID_JSON');

      ws.close();
    },
    10_000
  );

  it(
    'sends error on invalid answer shape (WS-03)',
    async () => {
      const { ws } = await connectAndReceiveFirst(
        '/ws/agentmail?endpoint=/v1/threads&error_code=503'
      );

      // Send valid JSON with answer.clarifications values that are not strings
      // z.record(z.string(), z.string()) requires string values — 123 fails
      ws.send(
        JSON.stringify({
          answer: { clarifications: { key: 123 } },
        })
      );

      const errMsg = await nextMessage(ws);
      expect(errMsg['status']).toBe('error');
      expect(errMsg['code']).toBe('VALIDATION_ERROR');

      ws.close();
    },
    10_000
  );

  it(
    'cleans up connection state on close (WS-05)',
    async () => {
      const { ws } = await connectAndReceiveFirst(
        '/ws/agentmail?endpoint=/v1/threads&error_code=429'
      );

      const sizeBeforeClose = connections.size;
      expect(sizeBeforeClose).toBeGreaterThanOrEqual(1);

      // Close the connection and wait for cleanup
      await new Promise<void>((resolve) => {
        ws.once('close', () => {
          // Give event loop several ticks for server-side onClose handler to run
          setTimeout(resolve, 50);
        });
        ws.close();
      });

      // Connection should be removed from the Map
      expect(connections.size).toBe(sizeBeforeClose - 1);
    },
    10_000
  );

  it(
    'concurrent connections get independent session_ids (WS-04)',
    async () => {
      const [result1, result2] = await Promise.all([
        connectAndReceiveFirst('/ws/agentmail?endpoint=/v1/threads&error_code=400'),
        connectAndReceiveFirst('/ws/agentmail?endpoint=/v1/messages&error_code=403'),
      ]);

      const sessionId1 = result1.firstMsg['session_id'] as string;
      const sessionId2 = result2.firstMsg['session_id'] as string;

      expect(typeof sessionId1).toBe('string');
      expect(typeof sessionId2).toBe('string');
      expect(sessionId1).not.toBe(sessionId2);

      result1.ws.close();
      result2.ws.close();
    },
    10_000
  );
});
