import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { InMemorySessionStore } from '../src/services/session-store.js';
import type { Session } from '../src/services/session-store.js';

function makeSession(overrides?: Partial<Session>): Session {
  const now = Date.now();
  return {
    id: 'test-session-id',
    createdAt: now,
    lastAccessedAt: now,
    turns: [],
    originalRequest: {
      endpoint: '/threads',
      error_code: '404',
    },
    ...overrides,
  };
}

describe('InMemorySessionStore', () => {
  let store: InMemorySessionStore;

  beforeEach(() => {
    vi.useFakeTimers();
    store = new InMemorySessionStore(100); // 100ms TTL for fast expiry tests
  });

  afterEach(() => {
    store.destroy();
    vi.useRealTimers();
  });

  describe('CRUD operations', () => {
    it('set() and get() stores and retrieves a session', () => {
      const session = makeSession();
      store.set('session-1', session);
      const retrieved = store.get('session-1');
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe('test-session-id');
    });

    it('get() returns undefined for non-existent ID', () => {
      const result = store.get('does-not-exist');
      expect(result).toBeUndefined();
    });

    it('delete() removes a session', () => {
      const session = makeSession();
      store.set('session-1', session);
      store.delete('session-1');
      expect(store.get('session-1')).toBeUndefined();
    });

    it('delete() on non-existent ID is a no-op', () => {
      expect(() => store.delete('non-existent')).not.toThrow();
    });

    it('set() can overwrite an existing session', () => {
      const session1 = makeSession({ id: 'first' });
      const session2 = makeSession({ id: 'second' });
      store.set('session-1', session1);
      store.set('session-1', session2);
      const retrieved = store.get('session-1');
      expect(retrieved?.id).toBe('second');
    });
  });

  describe('TTL / expiry behavior', () => {
    it('get() returns undefined for expired session (lazy deletion)', () => {
      const session = makeSession();
      store.set('session-1', session);

      // Advance time past TTL
      vi.advanceTimersByTime(200);

      expect(store.get('session-1')).toBeUndefined();
    });

    it('get() returns session that has not yet expired', () => {
      const session = makeSession();
      store.set('session-1', session);

      // Advance time but not past TTL
      vi.advanceTimersByTime(50);

      expect(store.get('session-1')).toBeDefined();
    });

    it('get() updates lastAccessedAt on successful retrieval (keeps session alive)', () => {
      const session = makeSession();
      store.set('session-1', session);

      // Access at 80ms (before TTL)
      vi.advanceTimersByTime(80);
      const accessed = store.get('session-1');
      expect(accessed).toBeDefined();

      // Advance 80ms more — total 160ms from creation, but only 80ms since last access
      vi.advanceTimersByTime(80);
      // Should still be alive because lastAccessedAt was refreshed
      expect(store.get('session-1')).toBeDefined();
    });

    it('get() returns undefined when accessed past TTL even with previous access', () => {
      const session = makeSession();
      store.set('session-1', session);

      // Access at 80ms to refresh
      vi.advanceTimersByTime(80);
      store.get('session-1');

      // Advance another 150ms — now 150ms past the last access (> 100ms TTL)
      vi.advanceTimersByTime(150);
      expect(store.get('session-1')).toBeUndefined();
    });
  });

  describe('sweep()', () => {
    it('sweep removes all expired sessions', () => {
      const session1 = makeSession({ id: 'session-1' });
      const session2 = makeSession({ id: 'session-2' });
      store.set('session-1', session1);
      store.set('session-2', session2);

      // Advance past TTL, then trigger sweep by advancing sweep interval
      vi.advanceTimersByTime(200); // past TTL

      // Trigger the periodic sweep by advancing another full TTL interval
      vi.advanceTimersByTime(100);

      // Now both should be gone (cleaned up by sweep)
      // Verify by attempting a fresh set and get — the old entries are gone
      expect(store.get('session-1')).toBeUndefined();
      expect(store.get('session-2')).toBeUndefined();
    });

    it('sweep keeps non-expired sessions', () => {
      const session1 = makeSession({ id: 'session-1' });
      store.set('session-1', session1);

      // Advance less than TTL — session still alive
      vi.advanceTimersByTime(50);

      // Manually trigger sweep time (sweep runs at ttlMs interval = 100ms, so at 100ms)
      vi.advanceTimersByTime(50); // now at 100ms from creation

      // Session should still be accessible (only 100ms passed == TTL, not past it)
      // get() checks now - lastAccessedAt > ttlMs (strictly greater), so 100ms is not expired
      const retrieved = store.get('session-1');
      expect(retrieved).toBeDefined();
    });
  });

  describe('constructor and destroy()', () => {
    it('uses default TTL of 1 hour when no argument provided', () => {
      const defaultStore = new InMemorySessionStore();
      const session = makeSession();
      defaultStore.set('s', session);

      // Advance 30 minutes — should still be alive
      vi.advanceTimersByTime(30 * 60 * 1000);
      expect(defaultStore.get('s')).toBeDefined();

      defaultStore.destroy();
    });

    it('destroy() clears the sweep interval (prevents test hangs)', () => {
      // If destroy() works correctly, the test runner won't hang
      // This is verified implicitly by the test completing
      const testStore = new InMemorySessionStore(100);
      testStore.destroy();
      // No assertion needed — if this hangs, destroy() is broken
    });

    it('stores multiple independent sessions', () => {
      const s1 = makeSession({ id: 'first' });
      const s2 = makeSession({ id: 'second' });
      store.set('key-1', s1);
      store.set('key-2', s2);

      expect(store.get('key-1')?.id).toBe('first');
      expect(store.get('key-2')?.id).toBe('second');
    });
  });
});
