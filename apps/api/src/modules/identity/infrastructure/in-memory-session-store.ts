import type { SessionStore } from '../application/session-store.js';
import type { SessionRecord } from '../domain/session.js';
import type { Role } from '../domain/roles.js';
import { verifyPassword } from './password.js';

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
 *
 * This store also supports account management for development/test so that
 * registration and login work correctly in non-production environments.
 * Passwords are hashed with Argon2id via `verifyPassword`; session tokens
 * are stored in plaintext for compatibility with the synchronous verification
 * path.
 */
export class InMemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, SessionRecord>();
  protected readonly accounts = new Map<string, {
    id: string;
    username: string;
    usernameNormalized: string;
    passwordHash: string;
    roles: readonly string[];
    createdAt: number;
    updatedAt: number;
  }>();

  put(session: SessionRecord): void {
    this.sessions.set(session.sessionId, session);
  }

  get(sessionId: string): SessionRecord | null {
    return this.sessions.get(sessionId) ?? null;
  }

  all(): readonly SessionRecord[] {
    return [...this.sessions.values()];
  }

  // Account management methods
  async createAccount(account: {
    id: string;
    username: string;
    usernameNormalized: string;
    passwordHash: string;
    roles: readonly string[];
    createdAt: number;
    updatedAt: number;
  }): Promise<void> {
    this.accounts.set(account.usernameNormalized, {
      id: account.id,
      username: account.username,
      usernameNormalized: account.usernameNormalized,
      passwordHash: account.passwordHash,
      roles: account.roles,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    });
  }

  async findAccountByNormalizedUsername(usernameNormalized: string): Promise<{
    id: string;
    username: string;
    usernameNormalized: string;
    passwordHash: string;
    roles: readonly string[];
    createdAt: number;
    updatedAt: number;
  } | null> {
    const account = this.accounts.get(usernameNormalized);
    if (!account) return null;
    return { ...account };
  }

  async findAccountById(id: string): Promise<{
    id: string;
    username: string;
    usernameNormalized: string;
    passwordHash: string;
    roles: readonly string[];
    createdAt: number;
    updatedAt: number;
  } | null> {
    for (const account of this.accounts.values()) {
      if (account.id === id) {
        return { ...account };
      }
    }
    return null;
  }

  async verifyAccountPassword(usernameNormalized: string, password: string): Promise<{
    id: string;
    username: string;
    usernameNormalized: string;
    roles: readonly Role[];
  } | null> {
    const account = this.accounts.get(usernameNormalized);
    if (!account) return null;

    const valid = await verifyPassword(password, account.passwordHash);
    if (!valid) return null;

    return {
      id: account.id,
      username: account.username,
      usernameNormalized: account.usernameNormalized,
      roles: account.roles as readonly Role[],
    };
  }
}
