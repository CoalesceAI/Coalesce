import pg from 'pg';
import type { ConversationTurn, Session } from '../domain/session.js';

// ---------------------------------------------------------------------------
// SessionStore interface — swappable to DynamoDB later without business logic changes
// ---------------------------------------------------------------------------

export interface SessionStore {
  get(id: string): Promise<Session | undefined>;
  set(id: string, session: Session): Promise<void>;
  delete(id: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// InMemorySessionStore — in-process Map with TTL and periodic sweep
// ---------------------------------------------------------------------------

export class InMemorySessionStore implements SessionStore {
  private readonly store = new Map<string, Session>();
  private readonly ttlMs: number;
  private readonly sweepInterval: ReturnType<typeof setInterval>;

  /**
   * @param ttlMs - Session TTL in milliseconds. Defaults to 1 hour.
   *                Can be driven by SESSION_TTL_MS env var at call site.
   */
  constructor(ttlMs: number = 60 * 60 * 1000) {
    this.ttlMs = ttlMs;
    // Periodic sweep removes expired entries — runs every ttlMs to keep
    // memory bounded without O(n) checks on every read
    this.sweepInterval = setInterval(() => this.sweep(), ttlMs);
  }

  /**
   * Returns the session if it exists and has not expired.
   * Updates lastAccessedAt on valid retrieval (sliding window TTL).
   */
  async get(id: string): Promise<Session | undefined> {
    const session = this.store.get(id);
    if (session === undefined) return undefined;

    const now = Date.now();
    if (now - session.lastAccessedAt > this.ttlMs) {
      // Lazy deletion: expired session encountered on read
      this.store.delete(id);
      return undefined;
    }

    // Refresh the access time to keep active sessions alive
    session.lastAccessedAt = now;
    return session;
  }

  async set(id: string, session: Session): Promise<void> {
    this.store.set(id, session);
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }

  /**
   * Removes all sessions whose lastAccessedAt is older than ttlMs.
   * Called automatically on a periodic interval.
   */
  private sweep(): void {
    const now = Date.now();
    for (const [id, session] of this.store.entries()) {
      if (now - session.lastAccessedAt > this.ttlMs) {
        this.store.delete(id);
      }
    }
  }

  /**
   * Clears the sweep interval. Must be called in tests to prevent process hangs.
   */
  destroy(): void {
    clearInterval(this.sweepInterval);
  }
}

// ---------------------------------------------------------------------------
// PostgresSessionStore — sessions table backed by Neon Postgres
// ---------------------------------------------------------------------------

/** Row shape returned from the sessions table. */
interface SessionRow {
  id: string;
  org_id: string | null;
  external_customer_id: string | null;
  turns: ConversationTurn[];
  original_request: Session['originalRequest'];
  status: string;
  created_at: Date;
  last_accessed_at: Date;
}

export class PostgresSessionStore implements SessionStore {
  private readonly pool: pg.Pool;
  private readonly ttlMs: number;

  /**
   * @param pool  - pg Pool instance (from src/db/pool.ts)
   * @param ttlMs - Session TTL in milliseconds. Defaults to 1 hour.
   */
  constructor(pool: pg.Pool, ttlMs: number = 60 * 60 * 1000) {
    this.pool = pool;
    this.ttlMs = ttlMs;
  }

  /**
   * Retrieves a session by id. Returns undefined if not found or expired.
   * Updates last_accessed_at on a valid hit (sliding-window TTL).
   */
  async get(id: string): Promise<Session | undefined> {
    const result = await this.pool.query<SessionRow>(
      `SELECT id, org_id, external_customer_id, turns, original_request, status, created_at, last_accessed_at
       FROM sessions
       WHERE id = $1`,
      [id],
    );

    const row = result.rows[0];
    if (!row) return undefined;

    // TTL check against last_accessed_at
    const lastAccessed = row.last_accessed_at.getTime();
    if (Date.now() - lastAccessed > this.ttlMs) {
      // Expired — delete lazily
      await this.delete(id);
      return undefined;
    }

    // Refresh last_accessed_at (sliding window)
    const now = new Date();
    await this.pool.query(
      `UPDATE sessions SET last_accessed_at = $1 WHERE id = $2`,
      [now, id],
    );

    return {
      id: row.id,
      orgId: row.org_id ?? undefined,
      externalCustomerId: row.external_customer_id ?? undefined,
      createdAt: row.created_at.getTime(),
      lastAccessedAt: now.getTime(),
      turns: row.turns,
      originalRequest: row.original_request,
    };
  }

  /**
   * Creates or updates a session. Uses UPSERT to handle both insert and update.
   */
  async set(id: string, session: Session): Promise<void> {
    await this.pool.query(
      `INSERT INTO sessions (id, org_id, external_customer_id, turns, original_request, created_at, last_accessed_at)
       VALUES ($1, $2, $3, $4, $5, to_timestamp($6::double precision / 1000), to_timestamp($7::double precision / 1000))
       ON CONFLICT (id) DO UPDATE SET
         org_id = EXCLUDED.org_id,
         external_customer_id = EXCLUDED.external_customer_id,
         turns = EXCLUDED.turns,
         original_request = EXCLUDED.original_request,
         last_accessed_at = EXCLUDED.last_accessed_at`,
      [
        id,
        session.orgId ?? null,
        session.externalCustomerId ?? null,
        JSON.stringify(session.turns),
        JSON.stringify(session.originalRequest),
        session.createdAt,
        session.lastAccessedAt,
      ],
    );
  }

  /**
   * Deletes a session by id.
   */
  async delete(id: string): Promise<void> {
    await this.pool.query(`DELETE FROM sessions WHERE id = $1`, [id]);
  }
}
