/**
 * Email webhook route.
 *
 * POST /email/:org — receives AgentMail webhook for message.received
 */

import { Hono } from 'hono';
import type { WebhookPayload } from './types.js';
import { handleIncomingEmail, type EmailChannelConfig } from './handler.js';

export function emailRoute(config: EmailChannelConfig): Hono {
  const app = new Hono();

  app.post('/:org', async (c) => {
    const orgSlug = c.req.param('org');
    if (!orgSlug) {
      return c.json({ error: 'Missing org slug' }, 400);
    }

    let payload: WebhookPayload;
    try {
      payload = await c.req.json() as WebhookPayload;
    } catch {
      return c.json({ error: 'Invalid JSON' }, 400);
    }

    // Only handle message.received events
    if (payload.event_type !== 'message.received') {
      return c.json({ ok: true, skipped: true, reason: `Event type '${payload.event_type}' not handled` });
    }

    // Process async — return 200 immediately so webhook doesn't timeout
    // (diagnosis takes ~7 seconds, webhook expects fast response)
    void handleIncomingEmail(orgSlug, payload, config).catch((err) => {
      console.error(`[email] Error handling email for ${orgSlug}:`, (err as Error).message);
    });

    return c.json({ ok: true, processing: true });
  });

  return app;
}
