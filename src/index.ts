import 'dotenv/config';
import { serve } from '@hono/node-server';
import { createNodeWebSocket } from '@hono/node-ws';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { healthRoute } from './routes/health.js';
import { supportRoute } from './routes/support.js';
import { wsRoute } from './routes/ws.js';
import { emailRoute } from './channels/email/route.js';
import { adminRoute } from './routes/admin.js';
import { knowledgeRoute } from './routes/knowledge.js';
import { integrationsRoute } from './routes/integrations.js';
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

// Browser admin UI (Next.js, e.g. :3001) calls this API (:3000) with Authorization — that is
// cross-origin; without CORS the preflight fails and client fetch() shows "Failed to fetch".
const corsOrigins = [
  'http://localhost:3001',
  'http://127.0.0.1:3001',
  ...(process.env['CORS_ORIGINS']?.split(',').map((s) => s.trim()).filter(Boolean) ?? []),
];
app.use(
  '*',
  cors({
    origin: corsOrigins,
    allowHeaders: ['Authorization', 'Content-Type'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
  }),
);

// Create WebSocket adapter — must be called before routes that use upgradeWebSocket
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

app.route('/health', healthRoute);
app.route('/support', supportRoute(sessionStore));
app.route('/', wsRoute(sessionStore, upgradeWebSocket));
app.route('/admin', adminRoute);
app.route('/admin', knowledgeRoute);
app.route('/admin', integrationsRoute);
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
