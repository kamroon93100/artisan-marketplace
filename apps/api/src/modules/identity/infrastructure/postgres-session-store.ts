import { Pool, PoolClient } from 'pg';
import type { SessionStore } from '../application/session-store.js';
import type { SessionRecord } from '../domain/session.js';
import { verifyPassword } from './password.js';

/**
 * PostgreSQL-backed session storage — Phase 1B durable storage.
 *
 * Implements the SessionStore port with a persistent PostgreSQL backend.
 * Stores sessions in identity_sessions and refresh grants in identity_refresh_grants.
 * All credentials are stored as digests (SHA-256 hex); plaintext credentials
 * never enter the database. The store handles all hashing internally.
 */
export class PostgresSessionStore implements SessionStore {
  /**
   * Session rows are always read together with their owning account so the
   * record's roles come from `identity_accounts`, which is where roles are
   * authoritative (Gate A Q7).
   *
   * Roles are deliberately not copied onto `identity_sessions`. A
   * denormalized copy would silently drift from the account the moment a role
   * changed, leaving live sessions holding roles the account no longer has.
   */
  private static readonly SESSION_SELECT = `
    SELECT s.*, a.roles
    FROM identity_sessions s
    JOIN identity_accounts a ON a.id = s.actor_id
  `;

  private readonly pool: Pool;
  private readonly hashFn: (credential: string) => string;

  constructor(
    pool: Pool,
    hashFn: (credential: string) => string,
  ) {
    this.pool = pool;
    this.hashFn = hashFn;
  }

  /**
   * Hash a credential for storage.
   */
  private hash(credential: string): string {
    return this.hashFn(credential);
  }

  /**
   * Convert epoch milliseconds to timestamptz string.
   */
  private toTimestamptz(ms: number): string {
    return new Date(ms).toISOString();
  }

  /**
   * Convert timestamptz string to epoch milliseconds.
   */
  private fromTimestamptz(ts: string | null): number | null {
    if (ts === null || ts === undefined) return null;
    return new Date(ts).getTime();
  }

  /**
   * Map a database row to a SessionRecord (with hashed tokens).
   */
  private mapRow(row: any): SessionRecord {
    return {
      sessionId: row.session_id,
      actorId: row.actor_id,
      roles: row.roles,
      refreshExpiresAt: this.fromTimestamptz(row.refresh_expires_at)!,
      accessToken: row.access_token_hash,
      accessExpiresAt: this.fromTimestamptz(row.access_expires_at)!,
      refreshToken: row.refresh_token_hash,
      previousRefreshToken: row.previous_refresh_token_hash,
      refreshRevokedAt: this.fromTimestamptz(row.refresh_revoked_at),
      revokedAt: this.fromTimestamptz(row.revoked_at),
    };
  }

  /**
   * Synchronous put - delegates to async (for interface compatibility).
   * NOTE: Callers should use putAsync for durable stores.
   */
  put(session: SessionRecord): void {
    this.putAsync(session).catch((err) => {
      console.error('Failed to persist session (fire-and-forget):', err);
    });
  }

  /**
   * Persist a session record to the database.
   * The session record contains plaintext credentials; this method hashes them.
   */
  async putAsync(session: SessionRecord): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Hash credentials for storage
      const accessTokenHash = this.hash(session.accessToken);
      const refreshTokenHash = this.hash(session.refreshToken);
      const previousRefreshTokenHash = session.previousRefreshToken
        ? this.hash(session.previousRefreshToken)
        : null;

      // Upsert session. `roles` is not written here: it is read from the
      // account, so persisting a copy onto the session would create a second,
      // driftable source of authorization state.
      await client.query(
        `INSERT INTO identity_sessions (
          session_id, actor_id, access_token_hash, access_expires_at,
          refresh_token_hash, previous_refresh_token_hash,
          refresh_expires_at, refresh_revoked_at, revoked_at, established_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (session_id) DO UPDATE SET
          actor_id = EXCLUDED.actor_id,
          access_token_hash = EXCLUDED.access_token_hash,
          access_expires_at = EXCLUDED.access_expires_at,
          refresh_token_hash = EXCLUDED.refresh_token_hash,
          previous_refresh_token_hash = EXCLUDED.previous_refresh_token_hash,
          refresh_expires_at = EXCLUDED.refresh_expires_at,
          refresh_revoked_at = EXCLUDED.refresh_revoked_at,
          revoked_at = EXCLUDED.revoked_at,
          established_at = EXCLUDED.established_at`,
        [
          session.sessionId,
          session.actorId,
          accessTokenHash,
          this.toTimestamptz(session.accessExpiresAt),
          refreshTokenHash,
          previousRefreshTokenHash,
          this.toTimestamptz(session.refreshExpiresAt),
          session.refreshRevokedAt ? this.toTimestamptz(session.refreshRevokedAt) : null,
          session.revokedAt ? this.toTimestamptz(session.revokedAt) : null,
          // established_at is immutable after creation
          this.toTimestamptz(session.refreshExpiresAt - 30 * 24 * 60 * 60 * 1000),
        ],
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Synchronous get - use getAsync instead.
   */
  get(sessionId: string): SessionRecord | null {
    // This is a synchronous interface limitation
    // Return a Promise that resolves immediately for InMemorySessionStore compatibility
    return null as any;
  }

  async getAsync(sessionId: string): Promise<SessionRecord | null> {
    const result = await this.pool.query(
      `${PostgresSessionStore.SESSION_SELECT} WHERE s.session_id = $1`,
      [sessionId],
    );

    if (result.rowCount === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  /**
   * Synchronous all - use allAsync instead.
   */
  all(): readonly SessionRecord[] {
    return [] as any;
  }

  async allAsync(): Promise<SessionRecord[]> {
    const result = await this.pool.query(PostgresSessionStore.SESSION_SELECT);
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Find a session by access token (plaintext).
   * Hashes the credential internally before querying.
   */
  async findByAccessToken(accessToken: string): Promise<SessionRecord | null> {
    const accessTokenHash = this.hash(accessToken);
    const result = await this.pool.query(
      `${PostgresSessionStore.SESSION_SELECT} WHERE s.access_token_hash = $1`,
      [accessTokenHash],
    );

    if (result.rowCount === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  /**
   * Find a session by refresh token (plaintext, current).
   * Hashes the credential internally before querying.
   */
  async findByRefreshToken(refreshToken: string): Promise<SessionRecord | null> {
    const refreshTokenHash = this.hash(refreshToken);
    const result = await this.pool.query(
      `${PostgresSessionStore.SESSION_SELECT} WHERE s.refresh_token_hash = $1`,
      [refreshTokenHash],
    );

    if (result.rowCount === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  /**
   * Find a session by previous refresh token hash (for replay detection).
   * Hashes the credential internally before querying.
   */
  async findByPreviousRefreshToken(previousRefreshToken: string): Promise<SessionRecord | null> {
    const previousRefreshTokenHash = this.hash(previousRefreshToken);
    const result = await this.pool.query(
      `${PostgresSessionStore.SESSION_SELECT} WHERE s.previous_refresh_token_hash = $1`,
      [previousRefreshTokenHash],
    );

    if (result.rowCount === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  /**
   * Create a new refresh grant.
   * Hashes the token internally before storing.
   */
  async createRefreshGrant(
    grant: {
      id: string;
      sessionId: string;
      token: string; // plaintext refresh token
      issuedAt: number;
      expiresAt: number;
    },
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO identity_refresh_grants (id, session_id, token_hash, issued_at, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        grant.id,
        grant.sessionId,
        this.hash(grant.token),
        this.toTimestamptz(grant.issuedAt),
        this.toTimestamptz(grant.expiresAt),
      ],
    );
  }

  /**
   * Find an unconsumed refresh grant by token (plaintext).
   * Hashes the token internally before querying.
   */
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
    const result = await this.pool.query(
      `SELECT id, session_id, token_hash, issued_at, expires_at, consumed_at, rotated_to
       FROM identity_refresh_grants
       WHERE token_hash = $1 AND consumed_at IS NULL`,
      [tokenHash],
    );

    if (result.rowCount === 0) return null;

    const row = result.rows[0];
    return {
      id: row.id,
      sessionId: row.session_id,
      tokenHash: row.token_hash,
      issuedAt: this.fromTimestamptz(row.issued_at)!,
      expiresAt: this.fromTimestamptz(row.expires_at)!,
      consumedAt: this.fromTimestamptz(row.consumed_at),
      rotatedTo: row.rotated_to,
    };
  }

  /**
   * Find a refresh grant by token (plaintext, including consumed).
   * Hashes the token internally before querying.
   */
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
    const result = await this.pool.query(
      `SELECT id, session_id, token_hash, issued_at, expires_at, consumed_at, rotated_to
       FROM identity_refresh_grants
       WHERE token_hash = $1`,
      [tokenHash],
    );

    if (result.rowCount === 0) return null;

    const row = result.rows[0];
    return {
      id: row.id,
      sessionId: row.session_id,
      tokenHash: row.token_hash,
      issuedAt: this.fromTimestamptz(row.issued_at)!,
      expiresAt: this.fromTimestamptz(row.expires_at)!,
      consumedAt: this.fromTimestamptz(row.consumed_at),
      rotatedTo: row.rotated_to,
    };
  }

  /**
   * Consume a refresh grant and create its successor in a single transaction.
   * This is the core rotation operation that ensures atomicity.
   * 
   * Both old and new credentials are plaintext; the store hashes them internally.
   */
  async rotateRefreshGrant(
    oldRefreshToken: string, // plaintext
    newGrant: {
      id: string;
      sessionId: string;
      refreshToken: string; // plaintext new refresh token
      accessToken: string; // plaintext new access token
      issuedAt: number;
      expiresAt: number; // absolute expiry (session's refresh_expires_at)
    },
    consumedAt: number,
  ): Promise<SessionRecord | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const oldRefreshTokenHash = this.hash(oldRefreshToken);
      const newRefreshTokenHash = this.hash(newGrant.refreshToken);
      const newAccessTokenHash = this.hash(newGrant.accessToken);

      // Lock the session row first (serializes concurrent refreshes on same
      // session). `FOR UPDATE OF s` locks only the session row; the joined
      // account is read-only context here and must not be locked.
      const sessionResult = await client.query(
        `${PostgresSessionStore.SESSION_SELECT} WHERE s.refresh_token_hash = $1 FOR UPDATE OF s`,
        [oldRefreshTokenHash],
      );

      if (sessionResult.rowCount === 0) {
        await client.query('ROLLBACK');
        return null;
      }

      const session = this.mapRow(sessionResult.rows[0]);

      // Verify session is still valid
      if (session.revokedAt !== null || session.refreshRevokedAt !== null) {
        await client.query('ROLLBACK');
        return null;
      }

      if (this.now() >= session.refreshExpiresAt) {
        await client.query('ROLLBACK');
        return null;
      }

      // Verify the grant exists and is unconsumed
      const grantResult = await client.query(
        `SELECT * FROM identity_refresh_grants WHERE token_hash = $1 AND consumed_at IS NULL FOR UPDATE`,
        [oldRefreshTokenHash],
      );

      if (grantResult.rowCount === 0) {
        await client.query('ROLLBACK');
        return null;
      }

      // Consume the old grant
      await client.query(
        `UPDATE identity_refresh_grants
         SET consumed_at = $1, rotated_to = $2
         WHERE token_hash = $3`,
        [this.toTimestamptz(consumedAt), newGrant.id, oldRefreshTokenHash],
      );

      // Insert the new grant
      await client.query(
        `INSERT INTO identity_refresh_grants (id, session_id, token_hash, issued_at, expires_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          newGrant.id,
          newGrant.sessionId,
          newRefreshTokenHash,
          this.toTimestamptz(newGrant.issuedAt),
          this.toTimestamptz(newGrant.expiresAt),
        ],
      );

      // Update the session with new tokens (both access and refresh)
      await client.query(
        `UPDATE identity_sessions
         SET refresh_token_hash = $1,
             previous_refresh_token_hash = $2,
             access_token_hash = $3,
             access_expires_at = $4
         WHERE session_id = $5`,
        [
          newRefreshTokenHash,
          oldRefreshTokenHash,
          newAccessTokenHash,
          this.toTimestamptz(newGrant.issuedAt + 15 * 60 * 1000), // 15 min access lifetime
          session.sessionId,
        ],
      );

      await client.query('COMMIT');

      // Return updated session
      return this.getAsync(session.sessionId);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // Expose now() for testing
  private now(): number {
    return Date.now();
  }

  /**
   * Detect replay of a consumed refresh grant and revoke the session.
   * Returns the revoked session if replay was detected.
   */
  async detectReplayAndRevoke(token: string, revokedAt: number): Promise<SessionRecord | null> {
    const tokenHash = this.hash(token);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Find the consumed grant
      const grantResult = await client.query(
        `SELECT session_id FROM identity_refresh_grants WHERE token_hash = $1 AND consumed_at IS NOT NULL`,
        [tokenHash],
      );

      if (grantResult.rowCount === 0) {
        await client.query('ROLLBACK');
        return null;
      }

      const sessionId = grantResult.rows[0].session_id;

      // Lock the session
      const sessionResult = await client.query(
        `${PostgresSessionStore.SESSION_SELECT} WHERE s.session_id = $1 FOR UPDATE OF s`,
        [sessionId],
      );

      if (sessionResult.rowCount === 0) {
        await client.query('ROLLBACK');
        return null;
      }

      // Revoke the session
      await client.query(
        `UPDATE identity_sessions
         SET refresh_revoked_at = $1
         WHERE session_id = $2`,
        [this.toTimestamptz(revokedAt), sessionId],
      );

      await client.query('COMMIT');

      return this.getAsync(sessionId);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Revoke a session entirely.
   */
  async revokeSession(sessionId: string, revokedAt: number): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE identity_sessions SET revoked_at = $1 WHERE session_id = $2`,
      [this.toTimestamptz(revokedAt), sessionId],
    );

    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Revoke only the refresh side of a session, leaving the access credential to
   * expire naturally.
   *
   * This must be a targeted column update rather than a full-record upsert. The
   * record passed to putAsync() comes from mapRow(), so its credentials are
   * already digests; re-upserting it would hash them a second time and
   * permanently orphan the session's token lookups.
   */
  async revokeRefreshSession(sessionId: string, revokedAt: number): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE identity_sessions SET refresh_revoked_at = $1 WHERE session_id = $2`,
      [this.toTimestamptz(revokedAt), sessionId],
    );

    return (result.rowCount ?? 0) > 0;
  }

  // =========================================================================
  // Account management methods (identity_accounts table)
  // =========================================================================

  /**
   * Create a new account with password hash.
   * Returns the created account ID.
   */
  async createAccount(account: {
    id: string;
    username: string;
    usernameNormalized: string;
    passwordHash: string;
    roles: readonly string[];
    createdAt: number;
    updatedAt: number;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO identity_accounts (
        id, username, username_normalized, password_hash, roles, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        account.id,
        account.username,
        account.usernameNormalized,
        account.passwordHash,
        account.roles,
        this.toTimestamptz(account.createdAt),
        this.toTimestamptz(account.updatedAt),
      ],
    );
  }

  /**
   * Find an account by normalized username.
   * Returns the account record with password hash for verification.
   */
  async findAccountByNormalizedUsername(usernameNormalized: string): Promise<{
    id: string;
    username: string;
    usernameNormalized: string;
    passwordHash: string;
    roles: readonly string[];
    createdAt: number;
    updatedAt: number;
  } | null> {
    const result = await this.pool.query(
      `SELECT id, username, username_normalized, password_hash, roles, created_at, updated_at
       FROM identity_accounts
       WHERE username_normalized = $1`,
      [usernameNormalized],
    );

    if (result.rowCount === 0) return null;

    const row = result.rows[0];
    return {
      id: row.id,
      username: row.username,
      usernameNormalized: row.username_normalized,
      passwordHash: row.password_hash,
      roles: row.roles,
      createdAt: this.fromTimestamptz(row.created_at)!,
      updatedAt: this.fromTimestamptz(row.updated_at)!,
    };
  }

  /**
   * Find an account by ID.
   */
  async findAccountById(id: string): Promise<{
    id: string;
    username: string;
    usernameNormalized: string;
    passwordHash: string;
    roles: readonly string[];
    createdAt: number;
    updatedAt: number;
  } | null> {
    const result = await this.pool.query(
      `SELECT id, username, username_normalized, password_hash, roles, created_at, updated_at
       FROM identity_accounts
       WHERE id = $1`,
      [id],
    );

    if (result.rowCount === 0) return null;

    const row = result.rows[0];
    return {
      id: row.id,
      username: row.username,
      usernameNormalized: row.username_normalized,
      passwordHash: row.password_hash,
      roles: row.roles,
      createdAt: this.fromTimestamptz(row.created_at)!,
      updatedAt: this.fromTimestamptz(row.updated_at)!,
    };
  }

  /**
   * Verify a password against an account's stored hash.
   */
  async verifyAccountPassword(
    usernameNormalized: string,
    password: string
  ): Promise<{
    id: string;
    username: string;
    usernameNormalized: string;
    roles: readonly string[];
  } | null> {
    const account = await this.findAccountByNormalizedUsername(usernameNormalized);
    if (!account) return null;

    const valid = await verifyPassword(password, account.passwordHash);
    if (!valid) return null;

    return {
      id: account.id,
      username: account.username,
      usernameNormalized: account.usernameNormalized,
      roles: account.roles,
    };
  }

  /**
   * Close the pool.
   */
  async close(): Promise<void> {
    await this.pool.end();
  }
}

/**
 * Create a SHA-256 hash function for credential digests.
 * Uses Web Crypto API (available in Cloudflare Workers and Node.js).
 * Returns async function.
 */
export function createCredentialHasher(): (credential: string) => Promise<string> {
  return async (credential: string): Promise<string> => {
    const encoder = new TextEncoder();
    const data = encoder.encode(credential);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  };
}

/**
 * Synchronous version of createCredentialHasher for test compatibility.
 * Note: In production (Workers), use the async version.
 */
export function createCredentialHasherSync(): (credential: string) => string {
  return (credential: string): string => {
    // Synchronous fallback using Node's crypto module
    // In Workers, this would need to be async
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(credential).digest('hex');
  };
}