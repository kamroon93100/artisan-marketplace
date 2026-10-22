import { InMemorySessionStore } from './in-memory-session-store.js';
import type { SessionStore } from '../application/session-store.js';
import type { SessionRecord } from '../domain/session.js';
import type { Role } from '../domain/roles.js';
import { verifyPassword } from '../infrastructure/password.js';

/**
 * Extended in-memory session store with account management for testing.
 * This is only for testing - production uses PostgresSessionStore.
 *
 * Overrides session token storage to hash tokens (matching PostgresSessionStore behavior),
 * while inheriting account management from InMemorySessionStore.
 */
export class TestSessionStore extends InMemorySessionStore implements SessionStore {
  // Refresh grant storage for R-C durable refresh-grant history
  private readonly refreshGrants = new Map<string, {
    id: string;
    sessionId: string;
    tokenHash: string;
    issuedAt: number;
    expiresAt: number;
    consumedAt: number | null;
    rotatedTo: string | null;
  }>();

  private hash(credential: string): string {
    // Simple hash for testing - in production use SHA-256
    let hash = 0;
    for (let i = 0; i < credential.length; i++) {
      hash = ((hash << 5) - hash) + credential.charCodeAt(i);
      hash |= 0;
    }
    return hash.toString(16);
  }

  override put(session: SessionRecord): void {
    // Hash tokens before storing (matching PostgresSessionStore behavior)
    const hashedSession: SessionRecord = {
      ...session,
      accessToken: this.hash(session.accessToken),
      refreshToken: this.hash(session.refreshToken),
      previousRefreshToken: session.previousRefreshToken ? this.hash(session.previousRefreshToken) : null,
    };
    super.put(hashedSession);
  }

  override get(sessionId: string): SessionRecord | null {
    return super.get(sessionId);
  }

  override all(): readonly SessionRecord[] {
    return super.all();
  }

  async putAsync(session: SessionRecord): Promise<void> {
    // Hash tokens before storing (matching PostgresSessionStore behavior)
    // Call super.put directly to avoid double hashing via put()
    const hashedSession: SessionRecord = {
      ...session,
      accessToken: this.hash(session.accessToken),
      refreshToken: this.hash(session.refreshToken),
      previousRefreshToken: session.previousRefreshToken ? this.hash(session.previousRefreshToken) : null,
    };
    super.put(hashedSession);
  }

  async getAsync(sessionId: string): Promise<SessionRecord | null> {
    return this.get(sessionId);
  }

  async allAsync(): Promise<readonly SessionRecord[]> {
    return this.all();
  }

  // =========================================================================
  // Refresh grant methods (R-C durable refresh-grant history)
  // =========================================================================

  async createRefreshGrant(grant: {
    id: string;
    sessionId: string;
    token: string;
    issuedAt: number;
    expiresAt: number;
  }): Promise<void> {
    this.refreshGrants.set(this.hash(grant.token), {
      id: grant.id,
      sessionId: grant.sessionId,
      tokenHash: this.hash(grant.token),
      issuedAt: grant.issuedAt,
      expiresAt: grant.expiresAt,
      consumedAt: null,
      rotatedTo: null,
    });
  }

  async findUnconsumedRefreshGrant(token: string): Promise<{
    id: string;
    sessionId: string;
    tokenHash: string;
    issuedAt: number;
    expiresAt: number;
    consumedAt: number | null;
    rotatedTo: string | null;
  } | null> {
    const tokenHash = this.hash(token);
    const grant = this.refreshGrants.get(tokenHash);
    if (!grant || grant.consumedAt !== null) return null;
    return { ...grant };
  }

  async findRefreshGrant(token: string): Promise<{
    id: string;
    sessionId: string;
    tokenHash: string;
    issuedAt: number;
    expiresAt: number;
    consumedAt: number | null;
    rotatedTo: string | null;
  } | null> {
    const tokenHash = this.hash(token);
    const grant = this.refreshGrants.get(tokenHash);
    if (!grant) return null;
    return { ...grant };
  }

  async rotateRefreshGrant(
    oldToken: string,
    newGrant: {
      id: string;
      sessionId: string;
      refreshToken: string;
      accessToken: string;
      issuedAt: number;
      expiresAt: number;
    },
    consumedAt: number
  ): Promise<SessionRecord | null> {
    const oldTokenHash = this.hash(oldToken);
    const newRefreshTokenHash = this.hash(newGrant.refreshToken);
    const newAccessTokenHash = this.hash(newGrant.accessToken);

    // Find and consume old grant
    const oldGrant = this.refreshGrants.get(oldTokenHash);
    if (!oldGrant || oldGrant.consumedAt !== null) return null;

    oldGrant.consumedAt = consumedAt;
    oldGrant.rotatedTo = newGrant.id;

    // Insert new grant
    this.refreshGrants.set(newRefreshTokenHash, {
      id: newGrant.id,
      sessionId: newGrant.sessionId,
      tokenHash: newRefreshTokenHash,
      issuedAt: newGrant.issuedAt,
      expiresAt: newGrant.expiresAt,
      consumedAt: null,
      rotatedTo: null,
    });

    // Update session
    const sessions = (this as any).sessions as Map<string, any>;
    const session = sessions.get(newGrant.sessionId);
    if (!session) return null;

    session.refreshToken = newRefreshTokenHash;
    session.previousRefreshToken = oldTokenHash;
    session.accessToken = newAccessTokenHash;
    session.accessExpiresAt = newGrant.issuedAt + 15 * 60 * 1000;

    return {
      sessionId: session.sessionId,
      actorId: session.actorId,
      roles: session.roles as readonly Role[],
      refreshExpiresAt: session.refreshExpiresAt,
      accessToken: newAccessTokenHash,
      accessExpiresAt: session.accessExpiresAt,
      refreshToken: newRefreshTokenHash,
      previousRefreshToken: oldTokenHash,
      refreshRevokedAt: session.refreshRevokedAt,
      revokedAt: session.revokedAt,
    };
  }

  async detectReplayAndRevoke(token: string, revokedAt: number): Promise<SessionRecord | null> {
    const tokenHash = this.hash(token);
    const grant = this.refreshGrants.get(tokenHash);
    if (!grant || grant.consumedAt === null) return null;

    const sessions = (this as any).sessions as Map<string, any>;
    const session = sessions.get(grant.sessionId);
    if (!session) return null;

    session.refreshRevokedAt = revokedAt;

    return {
      sessionId: session.sessionId,
      actorId: session.actorId,
      roles: session.roles as readonly Role[],
      refreshExpiresAt: session.refreshExpiresAt,
      accessToken: session.accessToken,
      accessExpiresAt: session.accessExpiresAt,
      refreshToken: session.refreshToken,
      previousRefreshToken: session.previousRefreshToken,
      refreshRevokedAt: session.refreshRevokedAt,
      revokedAt: session.revokedAt,
    };
  }

  async revokeRefreshSession(sessionId: string, revokedAt: number): Promise<boolean> {
    const sessions = (this as any).sessions as Map<string, any>;
    const session = sessions.get(sessionId);
    if (!session) return false;

    session.refreshRevokedAt = revokedAt;
    return true;
  }

  async revokeSession(sessionId: string, revokedAt: number): Promise<boolean> {
    const sessions = (this as any).sessions as Map<string, any>;
    const session = sessions.get(sessionId);
    if (!session) return false;

    session.revokedAt = revokedAt;
    return true;
  }

  async findByAccessToken(accessToken: string): Promise<SessionRecord | null> {
    const accessTokenHash = this.hash(accessToken);
    const sessions = (this as any).sessions as Map<string, any>;
    for (const session of sessions.values()) {
      if (session.accessToken === accessTokenHash) {
        return {
          sessionId: session.sessionId,
          actorId: session.actorId,
          roles: session.roles as readonly Role[],
          refreshExpiresAt: session.refreshExpiresAt,
          accessToken: session.accessToken,
          accessExpiresAt: session.accessExpiresAt,
          refreshToken: session.refreshToken,
          previousRefreshToken: session.previousRefreshToken,
          refreshRevokedAt: session.refreshRevokedAt,
          revokedAt: session.revokedAt,
        };
      }
    }
    return null;
  }

  async findByRefreshToken(refreshToken: string): Promise<SessionRecord | null> {
    const refreshTokenHash = this.hash(refreshToken);
    const sessions = (this as any).sessions as Map<string, any>;
    for (const session of sessions.values()) {
      if (session.refreshToken === refreshTokenHash) {
        return {
          sessionId: session.sessionId,
          actorId: session.actorId,
          roles: session.roles as readonly Role[],
          refreshExpiresAt: session.refreshExpiresAt,
          accessToken: session.accessToken,
          accessExpiresAt: session.accessExpiresAt,
          refreshToken: session.refreshToken,
          previousRefreshToken: session.previousRefreshToken,
          refreshRevokedAt: session.refreshRevokedAt,
          revokedAt: session.revokedAt,
        };
      }
    }
    return null;
  }

  async findByPreviousRefreshToken(previousRefreshToken: string): Promise<SessionRecord | null> {
    const previousRefreshTokenHash = this.hash(previousRefreshToken);
    const sessions = (this as any).sessions as Map<string, any>;
    for (const session of sessions.values()) {
      if (session.previousRefreshToken === previousRefreshTokenHash) {
        return {
          sessionId: session.sessionId,
          actorId: session.actorId,
          roles: session.roles as readonly Role[],
          refreshExpiresAt: session.refreshExpiresAt,
          accessToken: session.accessToken,
          accessExpiresAt: session.accessExpiresAt,
          refreshToken: session.refreshToken,
          previousRefreshToken: session.previousRefreshToken,
          refreshRevokedAt: session.refreshRevokedAt,
          revokedAt: session.revokedAt,
        };
      }
    }
    return null;
  }
}