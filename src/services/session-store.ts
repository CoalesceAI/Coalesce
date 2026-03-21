// ---------------------------------------------------------------------------
// Session types
// ---------------------------------------------------------------------------

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface Session {
  id: string;
  createdAt: number;
  lastAccessedAt: number;
  turns: ConversationTurn[];
  originalRequest: {
    endpoint: string;
    error_code: string;
    request_body?: Record<string, unknown>;
    context?: string;
    tried?: string[];
  };
}

// ---------------------------------------------------------------------------
// SessionStore interface — swappable to DynamoDB later without business logic changes
// ---------------------------------------------------------------------------

export interface SessionStore {
  get(id: string): Session | undefined;
  set(id: string, session: Session): void;
  delete(id: string): void;
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
  get(id: string): Session | undefined {
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

  set(id: string, session: Session): void {
    this.store.set(id, session);
  }

  delete(id: string): void {
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
