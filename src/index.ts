import 'dotenv/config';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { healthRoute } from './routes/health.js';
import { supportRoute } from './routes/support.js';
import { loadDocs } from './services/docs-loader.js';

const DOCS_DIR =
  process.env['DOCS_DIR'] ?? '../agentmail/agentmail-docs/fern/pages';
const OPENAPI_PATH =
  process.env['OPENAPI_PATH'] ?? '../agentmail/agentmail-docs/current-openapi.json';

console.log('Loading AgentMail docs...');
const docsContext = await loadDocs(DOCS_DIR, OPENAPI_PATH);
console.log(`Docs loaded: ${docsContext.length} chars`);

const app = new Hono();

app.route('/health', healthRoute);
app.route('/support', supportRoute(docsContext));

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err.message, code: 'INTERNAL_ERROR' }, 500);
});

const port = Number(process.env['PORT'] ?? 3000);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Coalesce listening on http://localhost:${info.port}`);
});

export { app };
