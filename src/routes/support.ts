import { Hono } from 'hono';
import { SupportRequestSchema } from '../schemas/request.js';

export function supportRoute(_docsContext: string): Hono {
  const app = new Hono();

  app.post('/', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json(
        { error: 'Invalid JSON body', code: 'VALIDATION_ERROR' },
        400
      );
    }

    const result = SupportRequestSchema.safeParse(body);
    if (!result.success) {
      return c.json(
        { error: 'Invalid request', code: 'VALIDATION_ERROR' },
        400
      );
    }

    // Stub response — Plan 03 will wire the real Claude diagnosis call
    return c.json({
      status: 'unknown',
      explanation: 'Diagnosis engine not yet connected',
    });
  });

  return app;
}
