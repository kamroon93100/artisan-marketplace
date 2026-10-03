import type { SessionRecord } from '../domain/session.js';

/**
 * Storage port for server-side session state (the "random token stored
 * server-side" half of the approved A2 mechanism).
 *
 * Phase 1A ships only the in-memory implementation, which is deliberately
 * limited to development and test: durable PostgreSQL-backed session
 * storage is Phase 1B and is not approved yet. Swapping the implementation
 * changes nothing about how the service resolves credentials, so the
 * mechanism can be validated before any schema decision is made.
 *
 * The port provides both synchronous (for InMemorySessionStore compatibility)
 * and asynchronous methods (for durable PostgreSQL store).
 * All credential hashing is handled internally by the store implementation.
 */
export type SessionStore = {
  /** @deprecated Use putAsync for durable stores */
  put(session: SessionRecord): void;
  /** @deprecated Use getAsync for durable stores */
  get(sessionId: string): SessionRecord | null;
  /** @deprecated Use allAsync for durable stores */
  all(): readonly SessionRecord[];

  // Async methods for durable storage
  putAsync?(session: SessionRecord): Promise<void>;
  getAsync?(sessionId: string): Promise<SessionRecord | null>;
  allAsync?(): Promise<readonly SessionRecord[]>;

  // Refresh grant operations (durable store only)
  // All methods accept plaintext credentials; the store handles hashing internally
  createRefreshGrant?(grant: {
    id: string;
    sessionId: string;
    token: string; // plaintext refresh token
    issuedAt: number;
    expiresAt: number;
  }): Promise<void>;
  findUnconsumedRefreshGrant?(token: string): Promise<{
    id: string;
    sessionId: string;
    tokenHash: string;
    issuedAt: number;
    expiresAt: number;
    consumedAt: number | null;
    rotatedTo: string | null;
  } | null>;
  findRefreshGrant?(token: string): Promise<{
    id: string;
    sessionId: string;
    tokenHash: string;
    issuedAt: number;
    expiresAt: number;
    consumedAt: number | null;
    rotatedTo: string | null;
  } | null>;
  rotateRefreshGrant?(
    oldToken: string, // plaintext
    newGrant: {
      id: string;
      sessionId: string;
      refreshToken: string; // plaintext new refresh token
      accessToken: string; // plaintext new access token
      issuedAt: number;
      expiresAt: number; // absolute expiry (session's refresh_expires_at)
    },
    consumedAt: number,
  ): Promise<SessionRecord | null>;
  detectReplayAndRevoke?(token: string, revokedAt: number): Promise<SessionRecord | null>;
  revokeSession?(sessionId: string, revokedAt: number): Promise<boolean>;
  revokeRefreshSession?(sessionId: string, revokedAt: number): Promise<boolean>;
  findByAccessToken?(accessToken: string): Promise<SessionRecord | null>;
  findByRefreshToken?(refreshToken: string): Promise<SessionRecord | null>;
  findByPreviousRefreshToken?(previousRefreshToken: string): Promise<SessionRecord | null>;

  // Account management operations (durable store only)
  createAccount?(account: {
    id: string;
    username: string;
    usernameNormalized: string;
    passwordHash: string;
    roles: readonly string[];
    createdAt: number;
    updatedAt: number;
  }): Promise<void>;
  findAccountByNormalizedUsername?(usernameNormalized: string): Promise<{
    id: string;
    username: string;
    usernameNormalized: string;
    passwordHash: string;
    roles: readonly string[];
    createdAt: number;
    updatedAt: number;
  } | null>;
  findAccountById?(id: string): Promise<{
    id: string;
    username: string;
    usernameNormalized: string;
    passwordHash: string;
    roles: readonly string[];
    createdAt: number;
    updatedAt: number;
  } | null>;
  verifyAccountPassword?(usernameNormalized: string, password: string): Promise<{
    id: string;
    username: string;
    usernameNormalized: string;
    roles: readonly string[];
  } | null>;
};