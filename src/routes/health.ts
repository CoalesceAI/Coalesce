import { Hono } from 'hono';

const startTime = Date.now();

export const healthRoute = new Hono().get('/', (c) => {
  return c.json({
    status: 'ok',
    uptime: Math.floor((Date.now() - startTime) / 1000),
  });
});
