import { Hono } from 'hono';
import type { Context } from 'hono';
import type { NodeWebSocket } from '@hono/node-ws';
import type { WSContext, WSEvents } from 'hono/ws';
import type { WebSocket } from 'ws';
import { AnswerSchema } from '../schemas/request.js';
import type { SupportRequest } from '../schemas/request.js';
import { diagnose, buildUserMessage } from '../services/diagnosis.js';
import type { SessionStore, Session } from '../services/session-store.js';
import type { AuthVariables } from '../middleware/auth.js';
import { orgAuth } from '../middleware/auth.js';
import { query } from '../db/pool.js';

// ---------------------------------------------------------------------------
// Per-connection state interface
// ---------------------------------------------------------------------------

interface ConnectionState {
  sessionId: string;
  pingInterval: ReturnType<typeof setInterval>;
  idleTimeout: ReturnType<typeof setTimeout>;
  isOpen: boolean;
}

// ---------------------------------------------------------------------------
// Constants — configurable via env vars for testing
// ---------------------------------------------------------------------------

const IDLE_MS = Number(process.env['WS_IDLE_MS'] ?? 5 * 60 * 1000); // 5 minutes
const PING_MS = Number(process.env['WS_PING_MS'] ?? 30_000); // 30 seconds

// ---------------------------------------------------------------------------
// Module-level connections Map — exported for test cleanup assertions
// ---------------------------------------------------------------------------

export const connections = new Map<string, ConnectionState>();

// ---------------------------------------------------------------------------
// Helper: load docs for an org directly from DB
// ---------------------------------------------------------------------------

async function loadOrgDocs(orgId: string): Promise<string> {
  const result = await query<{ content: string; title: string }>(
    `SELECT dc.content, dc.title FROM doc_content dc WHERE dc.org_id = $1 ORDER BY dc.created_at`,
    [orgId],
  );
  return result.rows
    .map((row) => `# ${row.title}\n\n${row.content}`)
    .join('\n\n---\n\n');
}

// ---------------------------------------------------------------------------
// wsRoute factory
// Accepts SessionStore for session persistence.
// upgradeWebSocket is injected from createNodeWebSocket in index.ts.
// ---------------------------------------------------------------------------

export function wsRoute(
  sessionStore: SessionStore,
  upgradeWebSocket: NodeWebSocket['upgradeWebSocket']
): Hono<{ Variables: AuthVariables }> {
  const app = new Hono<{ Variables: AuthVariables }>();

  app.get(
    '/ws/:org',
    // Middleware layer 1: org auth — validates Bearer token and sets orgId
    orgAuth,
    // Middleware layer 2: validate query params BEFORE WebSocket upgrade
    async (c: Context, next) => {
      const endpoint = c.req.query('endpoint');
      const errorCode = c.req.query('error_code');
      if (!endpoint || !errorCode) {
        return c.json(
          {
            status: 'error',
            code: 'MISSING_PARAMS',
            message: 'endpoint and error_code are required',
          },
          400
        );
      }
      await next();
    },
    // Middleware layer 3: WebSocket upgrade handler
    // IMPORTANT: The callback must NOT be async — it must return WSEvents synchronously.
    // Async work happens inside onOpen/onMessage handlers.
    upgradeWebSocket((c: Context): WSEvents<WebSocket> => {
      const connId = crypto.randomUUID();
      // Capture orgId from auth middleware (set before upgrade)
      const orgId = (c as Context<{ Variables: AuthVariables }>).get('orgId');
      const orgName = (c as Context<{ Variables: AuthVariables }>).get('org').name;
      // Accept optional customer_id from query params
      const customerId = c.req.query('customer_id');
      let isAlive = true;
      let isOpen = false;

      // Cleanup helper: clears timers and removes connection from Map
      function cleanup(): void {
        const state = connections.get(connId);
        if (state) {
          clearInterval(state.pingInterval);
          clearTimeout(state.idleTimeout);
          connections.delete(connId);
        }
      }

      return {
        onOpen: async (_evt: Event, ws: WSContext<WebSocket>) => {
          isOpen = true;

          // --- Load org-specific docs directly from DB ---
          const docsContext = await loadOrgDocs(orgId);

          // --- Heartbeat: 30-second ping/pong to detect dead connections ---
          ws.raw?.on('pong', () => {
            isAlive = true;
          });

          const pingInterval = setInterval(() => {
            if (!isAlive) {
              // No pong received since last ping — dead connection
              ws.close(1001, 'connection timeout');
              clearInterval(pingInterval);
              return;
            }
            isAlive = false;
            ws.raw?.ping();
          }, PING_MS);

          // --- Idle timeout: close after IDLE_MS of inactivity ---
          const idleTimeout = setTimeout(() => {
            if (isOpen) {
              ws.send(
                JSON.stringify({
                  status: 'error',
                  code: 'IDLE_TIMEOUT',
                  message: 'Connection closed due to inactivity',
                })
              );
              ws.close(1008, 'idle timeout');
            }
          }, IDLE_MS);

          // --- Build initial SupportRequest from URL query params ---
          const endpoint = c.req.query('endpoint')!;
          const errorCode = c.req.query('error_code')!;
          const context = c.req.query('context');
          const triedRaw = c.req.query('tried');
          const tried =
            triedRaw !== undefined && triedRaw.length > 0
              ? triedRaw
                  .split(',')
                  .map((s: string) => s.trim())
                  .filter(Boolean)
              : undefined;

          // --- Create session with orgId ---
          const session: Session = {
            id: crypto.randomUUID(),
            orgId,
            externalCustomerId: customerId,
            createdAt: Date.now(),
            lastAccessedAt: Date.now(),
            turns: [],
            originalRequest: {
              endpoint,
              error_code: errorCode,
              context,
              tried,
            },
          };
          await sessionStore.set(session.id, session);

          // Store connection state in module-level Map
          connections.set(connId, {
            sessionId: session.id,
            pingInterval,
            idleTimeout,
            isOpen,
          });

          // --- Call diagnose with initial request ---
          const initialRequest: SupportRequest = {
            endpoint,
            error_code: errorCode,
            context,
            tried,
          };

          const { response, assistantContent } = await diagnose(
            initialRequest,
            docsContext,
            [],
            undefined,
            orgName,
          );

          // Store turns in session
          const userContent = buildUserMessage(initialRequest, false);
          session.turns.push({ role: 'user', content: userContent });
          session.turns.push({ role: 'assistant', content: assistantContent });
          session.lastAccessedAt = Date.now();
          await sessionStore.set(session.id, session);

          // Guard against client disconnecting during diagnose() call
          if (isOpen) {
            ws.send(
              JSON.stringify({
                ...response,
                session_id: session.id,
                turn_number: 1,
              })
            );
          }
        },

        onMessage: async (evt: MessageEvent, ws: WSContext<WebSocket>) => {
          const state = connections.get(connId);
          if (!state) return;

          // Reset idle timer on every message
          clearTimeout(state.idleTimeout);
          state.idleTimeout = setTimeout(() => {
            if (isOpen) {
              ws.send(
                JSON.stringify({
                  status: 'error',
                  code: 'IDLE_TIMEOUT',
                  message: 'Connection closed due to inactivity',
                })
              );
              ws.close(1008, 'idle timeout');
            }
          }, IDLE_MS);

          // --- Parse JSON ---
          let parsed: unknown;
          try {
            parsed = JSON.parse(String(evt.data));
          } catch {
            if (isOpen) {
              ws.send(
                JSON.stringify({
                  status: 'error',
                  code: 'INVALID_JSON',
                  message: 'Message must be valid JSON',
                })
              );
            }
            return;
          }

          // --- Validate answer shape ---
          const parsedObj =
            parsed !== null && typeof parsed === 'object'
              ? (parsed as Record<string, unknown>)
              : null;
          const answerResult = AnswerSchema.safeParse(
            parsedObj !== null ? parsedObj['answer'] : undefined
          );
          if (!answerResult.success) {
            if (isOpen) {
              ws.send(
                JSON.stringify({
                  status: 'error',
                  code: 'VALIDATION_ERROR',
                  message: 'Invalid answer shape',
                })
              );
            }
            return;
          }

          // --- Look up session ---
          const session = await sessionStore.get(state.sessionId);
          if (!session) {
            if (isOpen) {
              ws.send(
                JSON.stringify({
                  status: 'error',
                  code: 'SESSION_NOT_FOUND',
                  message: 'Session expired',
                })
              );
              ws.close(1008, 'session expired');
            }
            return;
          }

          // Load fresh docs for follow-up
          const docsContext = await loadOrgDocs(orgId);

          // Turn number: existing completed pairs + 1
          const turnNumber = Math.floor(session.turns.length / 2) + 1;

          // Build follow-up request
          const followUpRequest: SupportRequest = {
            endpoint: session.originalRequest.endpoint,
            error_code: session.originalRequest.error_code,
            session_id: session.id,
            answer: answerResult.data,
          };

          // Call diagnose with session history
          const { response: diagResult, assistantContent } = await diagnose(
            followUpRequest,
            docsContext,
            session.turns,
            undefined,
            orgName,
          );

          // Store turns
          const userContent = buildUserMessage(followUpRequest, true);
          session.turns.push({ role: 'user', content: userContent });
          session.turns.push({ role: 'assistant', content: assistantContent });
          session.lastAccessedAt = Date.now();
          await sessionStore.set(session.id, session);

          // Guard against disconnection during diagnose() call
          if (isOpen) {
            ws.send(
              JSON.stringify({
                ...diagResult,
                session_id: session.id,
                turn_number: turnNumber,
              })
            );
          }
        },

        onClose: (_evt: CloseEvent, _ws: WSContext<WebSocket>) => {
          isOpen = false;
          cleanup();
        },

        onError: (_evt: Event, _ws: WSContext<WebSocket>) => {
          isOpen = false;
          cleanup();
        },
      };
    })
  );

  return app;
}
