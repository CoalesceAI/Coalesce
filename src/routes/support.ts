import { Hono } from 'hono';
import { SupportRequestSchema } from '../schemas/request.js';
import { diagnose } from '../services/diagnosis.js';
import { buildUserMessage } from '../services/diagnosis.js';
import {
  InMemorySessionStore,
  type Session,
  type SessionStore,
} from '../services/session-store.js';

export function supportRoute(
  docsContext: string,
  sessionStore: SessionStore = new InMemorySessionStore()
): Hono {
  const app = new Hono();

  app.post('/', async (c) => {
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
      const existingSession = sessionStore.get(data.session_id);
      if (existingSession === undefined) {
        return c.json(
          { error: 'Session not found', code: 'SESSION_NOT_FOUND' },
          404
        );
      }

      session = existingSession;
      isFollowUp = true;

      // Turn number: existing completed pairs + 1
      // At this point, session.turns contains completed pairs from prior turns
      // Each completed pair = [user, assistant] = 2 entries
      turnNumber = Math.floor(session.turns.length / 2) + 1;
    } else {
      // ---- Initial path ----
      const id = crypto.randomUUID();

      session = {
        id,
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

      sessionStore.set(id, session);
      turnNumber = 1;
      isFollowUp = false;
    }

    // -----------------------------------------------------------------------
    // Call diagnose with full conversation history (prior turns only)
    // The current request's message will be built inside diagnose()
    // -----------------------------------------------------------------------

    const { response: diagnosisResult, assistantContent } = await diagnose(
      data,
      docsContext,
      session.turns
    );

    // -----------------------------------------------------------------------
    // Store current user turn + assistant turn in session
    // user turn = formatted version of what was just sent to Claude
    // -----------------------------------------------------------------------

    const userContent = buildUserMessage(data, isFollowUp);
    session.turns.push({ role: 'user', content: userContent });
    session.turns.push({ role: 'assistant', content: assistantContent });
    session.lastAccessedAt = Date.now();
    sessionStore.set(session.id, session);

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
