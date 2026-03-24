import { query } from '../db/pool.js';

export interface UsageEvent {
  tenantId: string;
  sessionId?: string;
  eventType: 'diagnosis' | 'follow_up' | 'ws_connect' | 'ws_message';
  latencyMs?: number;
  tokensUsed?: Record<string, unknown>;
}

/**
 * Fire-and-forget usage logging. Never throws — errors are caught and logged.
 */
export async function logUsage(event: UsageEvent): Promise<void> {
  try {
    await query(
      `INSERT INTO usage (tenant_id, session_id, event_type, latency_ms, tokens_used)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        event.tenantId,
        event.sessionId ?? null,
        event.eventType,
        event.latencyMs ?? null,
        event.tokensUsed ? JSON.stringify(event.tokensUsed) : null,
      ],
    );
  } catch (err) {
    console.error('[usage] failed to log event:', (err as Error).message);
  }
}
