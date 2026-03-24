import { Hono } from 'hono';
import { SupportRequestSchema } from '../schemas/request.js';
import { diagnose } from '../services/diagnosis.js';
import { buildUserMessage } from '../services/diagnosis.js';
import type { Session, SessionStore } from '../services/session-store.js';
import type { DocsCache } from '../services/docs-cache.js';
import type { AuthVariables } from '../middleware/auth.js';
import { tenantAuth } from '../middleware/auth.js';
import { logUsage } from '../services/usage.js';

export function supportRoute(
  docsCache: DocsCache,
  sessionStore: SessionStore,
): Hono<{ Variables: AuthVariables }> {
  const app = new Hono<{ Variables: AuthVariables }>();

  app.post('/:tenant', tenantAuth, async (c) => {
    const tenantId = c.get('tenantId');

    // Load tenant-specific docs from cache
    const docsContext = await docsCache.get(tenantId);

    let body: Record<string, unknown> = {};
    try {
      body = (await c.req.json()) as Record<string, unknown>;
    } catch {
      // Empty or missing body is OK — query params may provide the fields
    }

    // Merge URL query params as defaults (support URL encodes error context)
    const query: Record<string, string> = {};
    for (const key of ['endpoint', 'error_code', 'context', 'tried']) {
      const val = c.req.query(key);
      if (val !== undefined) query[key] = val;
    }
    const merged = { ...query, ...body };

    const result = SupportRequestSchema.safeParse(merged);
    if (!result.success) {
      return c.json(
        { error: 'Invalid request', code: 'VALIDATION_ERROR' },
        400
      );
    }

    const data = result.data;

    // -----------------------------------------------------------------------
    // Branch: follow-up request (session_id present) vs initial request
    // -----------------------------------------------------------------------

    let session: Session;
    let turnNumber: number;
    let isFollowUp: boolean;

    if (data.session_id !== undefined) {
      // ---- Follow-up path ----
      const existingSession = await sessionStore.get(data.session_id);
      if (existingSession === undefined) {
        return c.json(
          { error: 'Session not found', code: 'SESSION_NOT_FOUND' },
          404
        );
      }

      session = existingSession;
      isFollowUp = true;

      // Turn number: existing completed pairs + 1
      turnNumber = Math.floor(session.turns.length / 2) + 1;
    } else {
      // ---- Initial path ----
      const id = crypto.randomUUID();

      session = {
        id,
        tenantId,
        createdAt: Date.now(),
        lastAccessedAt: Date.now(),
        turns: [],
        originalRequest: {
          endpoint: data.endpoint ?? '',
          error_code: data.error_code ?? '',
          request_body: data.request_body as Record<string, unknown> | undefined,
          context: data.context,
          tried: data.tried,
        },
      };

      await sessionStore.set(id, session);
      turnNumber = 1;
      isFollowUp = false;
    }

    // -----------------------------------------------------------------------
    // Call diagnose with full conversation history (prior turns only)
    // -----------------------------------------------------------------------

    const t0 = Date.now();
    const { response: diagnosisResult, assistantContent } = await diagnose(
      data,
      docsContext,
      session.turns
    );
    const latencyMs = Date.now() - t0;

    // Fire-and-forget usage tracking
    void logUsage({
      tenantId,
      sessionId: session.id,
      eventType: isFollowUp ? 'follow_up' : 'diagnosis',
      latencyMs,
    });

    // -----------------------------------------------------------------------
    // Store current user turn + assistant turn in session
    // -----------------------------------------------------------------------

    const userContent = buildUserMessage(data, isFollowUp);
    session.turns.push({ role: 'user', content: userContent });
    session.turns.push({ role: 'assistant', content: assistantContent });
    session.lastAccessedAt = Date.now();
    await sessionStore.set(session.id, session);

    // -----------------------------------------------------------------------
    // Return enriched response with session_id and turn_number
    // -----------------------------------------------------------------------

    const enriched = {
      ...diagnosisResult,
      session_id: session.id,
      turn_number: turnNumber,
    };

    const statusCode = diagnosisResult.status === 'error' ? 500 : 200;
    return c.json(enriched, statusCode);
  });

  return app;
}
