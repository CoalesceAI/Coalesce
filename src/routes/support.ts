import { Hono } from 'hono';
import { SupportRequestSchema } from '../schemas/request.js';
import { diagnose } from '../services/diagnosis.js';
import { buildUserMessage } from '../services/diagnosis.js';
import type { Session } from '../domain/session.js';
import type { SessionStore } from '../repositories/sessions.js';
import type { AuthVariables } from '../middleware/auth.js';
import { orgAuth } from '../middleware/auth.js';
import { loadOrgDocs } from '../repositories/documents.js';

export function supportRoute(
  sessionStore: SessionStore,
): Hono<{ Variables: AuthVariables }> {
  const app = new Hono<{ Variables: AuthVariables }>();

  app.post('/:org', orgAuth, async (c) => {
    const orgId = c.get('orgId');
    const orgName = c.get('org').name;

    // Load org-specific docs from DB via repository
    const docsContext = await loadOrgDocs(orgId);

    // Accept optional customer_id from query params
    const customerId = c.req.query('customer_id');

    let body: Record<string, unknown> = {};
    try {
      body = (await c.req.json()) as Record<string, unknown>;
    } catch {
      // Empty or missing body is OK — query params may provide the fields
    }

    // Merge URL query params as defaults (support URL encodes error context)
    const queryParams: Record<string, string> = {};
    for (const key of ['endpoint', 'error_code', 'context', 'tried']) {
      const val = c.req.query(key);
      if (val !== undefined) queryParams[key] = val;
    }
    const merged = { ...queryParams, ...body };

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
        orgId,
        externalCustomerId: customerId,
        createdAt: Date.now(),
        lastAccessedAt: Date.now(),
        status: 'active',
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

    const { response: diagnosisResult, assistantContent } = await diagnose(
      data,
      docsContext,
      session.turns,
      undefined,
      orgName,
    );

    // -----------------------------------------------------------------------
    // Store current user turn + assistant turn in session, update status
    // -----------------------------------------------------------------------

    const userContent = buildUserMessage(data, isFollowUp);
    session.turns.push({ role: 'user', content: userContent });
    session.turns.push({ role: 'assistant', content: assistantContent });
    session.lastAccessedAt = Date.now();

    const statusMap: Record<string, 'resolved' | 'needs_info' | 'unknown' | 'active'> = {
      resolved: 'resolved',
      needs_info: 'needs_info',
      unknown: 'unknown',
    };
    session.status = statusMap[diagnosisResult.status] ?? 'active';
    if (session.status === 'resolved' && !session.resolvedAt) {
      session.resolvedAt = Date.now();
    }

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
