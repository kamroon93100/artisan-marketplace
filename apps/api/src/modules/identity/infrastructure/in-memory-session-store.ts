import type { SessionStore } from '../application/session-store.js';
import type { SessionRecord } from '../domain/session.js';

/**
 * Non-persistent session storage — the Phase 1A boundary.
 *
 * Volatile memory is a convenience for validating the mechanism, never a
 * production fallback: sessions here vanish on restart and are not shared
 * between isolates, so this store is only ever composed for development
 * and test (see `composition.ts`). Durable PostgreSQL-backed session
 * storage is Phase 1B and requires its own migration approval.
 *
 * Records are held by reference; the service reads them through `all()`,
 * applies the state transition, and writes the same record back through
 * `put()`, so no second copy of a credential exists anywhere.
 */
export class InMemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, SessionRecord>();

  put(session: SessionRecord): void {
    this.sessions.set(session.sessionId, session);
  }

  get(sessionId: string): SessionRecord | null {
    return this.sessions.get(sessionId) ?? null;
  }

  all(): readonly SessionRecord[] {
    return [...this.sessions.values()];
  }
}
