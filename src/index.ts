import 'dotenv/config';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { healthRoute } from './routes/health.js';
import { supportRoute } from './routes/support.js';

const app = new Hono();

app.route('/health', healthRoute);
// Plan 02 will pass real docsContext here; for now empty string
app.route('/support', supportRoute(''));

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err.message, code: 'INTERNAL_ERROR' }, 500);
});

const port = Number(process.env['PORT'] ?? 3000);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Coalesce listening on http://localhost:${info.port}`);
});

export { app };
