import 'dotenv/config';
import { serve } from '@hono/node-server';
import { createNodeWebSocket } from '@hono/node-ws';
import { Hono } from 'hono';
import { healthRoute } from './routes/health.js';
import { supportRoute } from './routes/support.js';
import { wsRoute } from './routes/ws.js';
import { loadDocs } from './services/docs-loader.js';
import { PostgresSessionStore } from './services/session-store.js';
import { pool } from './db/pool.js';

const DOCS_DIR =
  process.env['DOCS_DIR'] ?? '../agentmail/agentmail-docs/fern/pages';
const OPENAPI_PATH =
  process.env['OPENAPI_PATH'] ?? '../agentmail/agentmail-docs/current-openapi.json';

console.log('Loading AgentMail docs...');
const docsContext = await loadDocs(DOCS_DIR, OPENAPI_PATH);
console.log(`Docs loaded: ${docsContext.length} chars`);

const ttlMs = Number(process.env['SESSION_TTL_MS'] ?? 60 * 60 * 1000);
const sessionStore = new PostgresSessionStore(pool, ttlMs);

const app = new Hono();

// Create WebSocket adapter — must be called before routes that use upgradeWebSocket
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

app.route('/health', healthRoute);
app.route('/support', supportRoute(docsContext, sessionStore));
app.route('/', wsRoute(docsContext, sessionStore, upgradeWebSocket));

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err.message, code: 'INTERNAL_ERROR' }, 500);
});

const port = Number(process.env['PORT'] ?? 3000);

const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Coalesce listening on http://localhost:${info.port}`);
});

// Wire WebSocket upgrade handling to the HTTP server
injectWebSocket(server);

export { app, server };
