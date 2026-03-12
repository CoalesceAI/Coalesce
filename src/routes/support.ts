import { Hono } from 'hono';
import { SupportRequestSchema } from '../schemas/request.js';
import { diagnose } from '../services/diagnosis.js';

export function supportRoute(docsContext: string): Hono {
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

    const diagnosis = await diagnose(result.data, docsContext);

    const statusCode =
      diagnosis.status === 'error' ? 500 : 200;

    return c.json(diagnosis, statusCode);
  });

  return app;
}
