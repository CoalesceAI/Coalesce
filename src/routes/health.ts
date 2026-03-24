import { Hono } from 'hono';
import { query } from '../db/pool.js';

const startTime = Date.now();

export const healthRoute = new Hono().get('/', async (c) => {
  let database: 'connected' | 'disconnected' = 'disconnected';

  try {
    await query('SELECT 1');
    database = 'connected';
  } catch {
    // DB unreachable — report degraded
  }

  const status = database === 'connected' ? 'ok' : 'degraded';

  return c.json({
    status,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    database,
  });
});
