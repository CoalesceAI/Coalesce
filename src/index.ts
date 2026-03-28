import 'dotenv/config';
import { serve } from '@hono/node-server';
import { createNodeWebSocket } from '@hono/node-ws';
import { Hono } from 'hono';
import { healthRoute } from './routes/health.js';
import { supportRoute } from './routes/support.js';
import { wsRoute } from './routes/ws.js';
import { emailRoute } from './channels/email/route.js';
import { PostgresSessionStore } from './repositories/sessions.js';
import { pool } from './db/pool.js';
import { runMigrations } from './db/migrate.js';

// ---------------------------------------------------------------------------
// Startup: run pending migrations
// ---------------------------------------------------------------------------

console.log('Running database migrations...');
await runMigrations(pool);

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

const ttlMs = Number(process.env['SESSION_TTL_MS'] ?? 60 * 60 * 1000);
const sessionStore = new PostgresSessionStore(pool, ttlMs);

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

const app = new Hono();

// Create WebSocket adapter — must be called before routes that use upgradeWebSocket
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

app.route('/health', healthRoute);
app.route('/support', supportRoute(sessionStore));
app.route('/', wsRoute(sessionStore, upgradeWebSocket));
app.route('/email', emailRoute({
  agentmailBaseUrl: process.env['AGENTMAIL_BASE_URL'] ?? 'https://api.agentmail.to/v0',
  agentmailApiKey: process.env['AGENTMAIL_API_KEY'] ?? '',
  sessionStore,
}));

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err.message, code: 'INTERNAL_ERROR' }, 500);
});

const port = Number(process.env['PORT'] ?? 3000);

const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Apoyo listening on http://localhost:${info.port}`);
});

// Wire WebSocket upgrade handling to the HTTP server
injectWebSocket(server);

export { app, server };
