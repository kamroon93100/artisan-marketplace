import { AppError } from '../../../shared/errors/app-error.js';
import { constantTimeEquals } from '../../../shared/security/constant-time.js';
import { mintCredential } from '../domain/credential.js';
import { isRole } from '../domain/roles.js';
import type { Role } from '../domain/roles.js';
import {
  ACCESS_TOKEN_LIFETIME_MS,
  REFRESH_TOKEN_LIFETIME_MS,
} from '../domain/session.js';
import type {
  IssuedSession,
  LogoutOutcome,
  RefreshOutcome,
  SessionRecord,
  SessionVerification,
} from '../domain/session.js';
import type { SessionStore } from './session-store.js';
import { hashPassword, verifyPassword } from '../infrastructure/password.js';

/** Injectable clock so expiry is testable without sleeping. */
export type Clock = () => number;

/**
 * Sanitized register-failure diagnostic (stage + error class only).
 * Never includes password material, tokens, connection strings, SQL
 * parameters, or password hashes: connection URLs, PHC hashes, and any
 * `password...` fragment are redacted before logging, and the message
 * is truncated.
 */
function classifyRegisterFailure(stage: string, error: unknown): void {
  const name = error instanceof Error ? error.name : typeof error;
  const maybeCode = (error as { code?: unknown } | null | undefined)?.code;
  const code = typeof maybeCode === 'string' ? maybeCode : undefined;
  const raw = error instanceof Error ? error.message : String(error);
  const message = raw
    .replace(/postgres(?:ql)?:\/\/\S+/gi, 'postgres://[redacted]')
    .replace(/\$argon2[^\s"']+/gi, '[phc-hash]')
    .replace(/password[^\s,;]*/gi, 'password[redacted]')
    .slice(0, 200);
  console.error(
    '[identity] register failed',
    JSON.stringify({ stage, name, code, message }),
  );
}

export type EstablishSessionInput = {
  /** Server-assigned identity. Never taken from a request. */
  actorId: string;
  /** Server-assigned roles. Never taken from a request. */
  roles: readonly Role[];
};

/**
 * The Identity core: establishes, verifies, refreshes, and revokes
 * server-issued opaque sessions (M8 Gate A, mechanism A2).
 *
 * Boundary rules this class exists to enforce:
 *
 * - It owns every credential decision. Callers pass an opaque credential
 *   in and get an explicit outcome back; no caller inspects, decodes, or
 *   re-implements session rules.
 * - `verifyAccessToken` resolves to server-stored state only. A presented
 *   credential never carries an identity or a role with it: two distinct
 *   credentials resolve to two distinct actors because two distinct
 *   server-side records exist, not because the credential says so.
 * - Every failure is an explicit reason (ADR-006 failure states), never a
 *   silent `null` and never a generic success. Reasons carry no credential
 *   material, so they are safe to propagate into errors and logs.
   * - Nothing here logs credential material. Register failures are logged
   *   only as stage + error class + sanitized message (no password, token,
   *   hash, or connection details). Credentials leave this class only
   *   through the value returned by `establish`/`refresh`.
 *
 * Lifetime and rotation rules are the approved ones: 15-minute access,
 * 30-day absolute refresh window pinned to establishment, single-use
 * rotating refresh credential, logout revoking the refresh session while
 * leaving the access credential to expire naturally.
 */
export class IdentityService {
  constructor(
    private readonly store: SessionStore,
    private readonly now: Clock = () => Date.now(),
  ) {}

  private get isDurableStore(): boolean {
    return typeof this.store.putAsync === 'function';
  }

  /**
   * Issues a new session and its two credentials.
   *
   * The caller is trusted server code: Phase 1A has no HTTP surface, and
   * there is no client role-assignment path. The roles recorded here are
   * the server-authoritative roles every later verification returns.
   */
  establish(input: EstablishSessionInput): IssuedSession {
    const actorId = input.actorId?.trim();

    if (!actorId) {
      throw new AppError(
        'VALIDATION_FAILED',
        'A session requires a server-assigned actor id.',
      );
    }

    if (!input.roles || input.roles.length === 0) {
      throw new AppError(
        'VALIDATION_FAILED',
        'A session requires at least one server-assigned role.',
      );
    }

    for (const role of input.roles) {
      if (!isRole(role)) {
        throw new AppError(
          'VALIDATION_FAILED',
          'A session role is not an assigned role of this system.',
          { role: String(role) },
        );
      }
    }

    const issuedAt = this.now();
    const sessionId = crypto.randomUUID();

    const accessToken = mintCredential();
    const refreshToken = mintCredential();

    const record: SessionRecord = {
      sessionId,
      actorId,
      roles: [...input.roles],
      refreshExpiresAt: issuedAt + REFRESH_TOKEN_LIFETIME_MS,
      accessToken,
      accessExpiresAt: issuedAt + ACCESS_TOKEN_LIFETIME_MS,
      refreshToken,
      previousRefreshToken: null,
      refreshRevokedAt: null,
      revokedAt: null,
    };

    this.store.put(record);

    // If durable store, also persist refresh grant (fire-and-forget for sync interface)
    if (this.isDurableStore && this.store.createRefreshGrant) {
      this.store.createRefreshGrant({
        id: crypto.randomUUID(),
        sessionId,
        token: refreshToken,
        issuedAt,
        expiresAt: issuedAt + REFRESH_TOKEN_LIFETIME_MS,
      }).catch((err) => {
        console.error('Failed to create refresh grant:', err);
      });
    }

    return {
      sessionId,
      accessToken,
      refreshToken,
      accessExpiresAt: record.accessExpiresAt,
      refreshExpiresAt: record.refreshExpiresAt,
      actor: {
        actorId,
        username: input.actorId,
        roles: input.roles,
      },
    };
  }

  /**
   * Async version of establish for durable stores.
   * Persists session and initial refresh grant.
   */
  async establishAsync(input: EstablishSessionInput): Promise<IssuedSession> {
    const actorId = input.actorId?.trim();

    if (!actorId) {
      throw new AppError(
        'VALIDATION_FAILED',
        'A session requires a server-assigned actor id.',
      );
    }

    if (!input.roles || input.roles.length === 0) {
      throw new AppError(
        'VALIDATION_FAILED',
        'A session requires at least one server-assigned role.',
      );
    }

    for (const role of input.roles) {
      if (!isRole(role)) {
        throw new AppError(
          'VALIDATION_FAILED',
          'A session role is not an assigned role of this system.',
          { role: String(role) },
        );
      }
    }

    const issuedAt = this.now();
    const sessionId = crypto.randomUUID();

    const accessToken = mintCredential();
    const refreshToken = mintCredential();

    const record: SessionRecord = {
      sessionId,
      actorId,
      roles: [...input.roles],
      refreshExpiresAt: issuedAt + REFRESH_TOKEN_LIFETIME_MS,
      accessToken,
      accessExpiresAt: issuedAt + ACCESS_TOKEN_LIFETIME_MS,
      refreshToken,
      previousRefreshToken: null,
      refreshRevokedAt: null,
      revokedAt: null,
    };

    if (this.isDurableStore && this.store.putAsync) {
      await this.store.putAsync(record);
    } else {
      this.store.put(record);
    }

    if (this.isDurableStore && this.store.createRefreshGrant) {
      await this.store.createRefreshGrant({
        id: crypto.randomUUID(),
        sessionId,
        token: refreshToken,
        issuedAt,
        expiresAt: issuedAt + REFRESH_TOKEN_LIFETIME_MS,
      });
    }

    // Fetch username from account for the response
    let username = actorId; // fallback
    if (this.store.findAccountById) {
      const account = await this.store.findAccountById(actorId);
      if (account) {
        username = account.username;
      }
    }

    return {
      sessionId,
      accessToken,
      refreshToken,
      accessExpiresAt: record.accessExpiresAt,
      refreshExpiresAt: record.refreshExpiresAt,
      actor: {
        actorId,
        username,
        roles: input.roles,
      },
    };
  }

  // =========================================================================
  // Auth HTTP Contract Methods (M8 Q6 / Q5.4 / Q3.1)
  // =========================================================================

  /**
   * Register a new account and establish the initial authenticated session.
   *
   * Per M8 Q5.4: Registration MUST automatically establish the initial
   * authenticated session. Create account → assign BUYER server-side →
   * create first session → return authenticated session payload.
   *
   * Per M8 Q3.4: Duplicate normalized username = 409 CONFLICT.
   * Per Q5.2: Username normalization = `^[a-z0-9][a-z0-9_.-]{2,29}$`,
   * 3-30 characters, lowercase canonical form.
   * Per Q5.3: 15-character minimum password length, no composition rules.
   * Per Q5.1: Argon2id password hashing with approved baseline parameters.
   *
   * Returns the same session schema as login/refresh (P4 corrected).
   * Status: 201 Created.
   */
  async register(input: {
    username: string;
    password: string;
  }): Promise<{
    sessionId: string;
    accessToken: string;
    refreshToken: string;
    accessExpiresAt: number;
    refreshExpiresAt: number;
    actor: {
      actorId: string;
      username: string;
      roles: readonly string[];
    };
  }> {
    // Validate username format (Q5.2)
    const normalizedUsername = input.username.toLowerCase().trim();
    const usernameFormatRegex = /^[a-z0-9][a-z0-9_.-]{2,29}$/;
    if (!usernameFormatRegex.test(normalizedUsername)) {
      throw new AppError(
        'VALIDATION_FAILED',
        'Username must be 3-30 characters, start with alphanumeric, and contain only lowercase letters, numbers, underscore, hyphen, or period.',
        { field: 'username' },
      );
    }

    // Reserved username check (Q5.2, P10)
    if (this.isReservedUsername(normalizedUsername)) {
      throw new AppError(
        'VALIDATION_FAILED',
        'This username is reserved.',
        { field: 'username' },
      );
    }

    // Password validation (Q5.3)
    if (input.password.length < 15) {
      throw new AppError(
        'VALIDATION_FAILED',
        'Password must be at least 15 characters.',
        { field: 'password' },
      );
    }

    // Password maximum (Q5.3, P12)
    if (input.password.length > 1024) {
      throw new AppError(
        'VALIDATION_FAILED',
        'Password is too long.',
        { field: 'password' },
      );
    }

    // Operational segment: any non-AppError failure here is classified by
    // stage (sanitized) before it surfaces as 503 from the HTTP layer.
    let stage = 'duplicate-username-check';
    try {
      // Check for duplicate username (Q3.4, Q5.4)
      if (this.isDurableStore && this.store.findAccountByNormalizedUsername) {
        const existing = await this.store.findAccountByNormalizedUsername(normalizedUsername);
        if (existing) {
          throw new AppError(
            'CONFLICT',
            'Username already exists.',
            { field: 'username' },
          );
        }
      }

      // Hash password with Argon2id (Q5.1)
      stage = 'password-hash';
      const passwordHash = await hashPassword(input.password);

      // Create account
      stage = 'persist-account';
      const issuedAt = this.now();
      const actorId = crypto.randomUUID();

      const account = {
        id: actorId,
        username: input.username.trim(), // Store original case for display
        usernameNormalized: normalizedUsername,
        passwordHash,
        roles: ['BUYER'] as const, // Q3.3: BUYER only
        createdAt: issuedAt,
        updatedAt: issuedAt,
      };

      // Persist account
      if (this.isDurableStore && this.store.createAccount) {
        await this.store.createAccount(account);
      }

      // Establish initial session (Q5.4: auto-establish session)
      stage = 'persist-session';
      const sessionId = crypto.randomUUID();
      const issuedAtSession = this.now();
      const accessToken = mintCredential();
      const refreshToken = mintCredential();

      const record: SessionRecord = {
        sessionId,
        actorId,
        roles: ['BUYER'],
        refreshExpiresAt: issuedAtSession + REFRESH_TOKEN_LIFETIME_MS,
        accessToken,
        accessExpiresAt: issuedAtSession + ACCESS_TOKEN_LIFETIME_MS,
        refreshToken,
        previousRefreshToken: null,
        refreshRevokedAt: null,
        revokedAt: null,
      };

      if (this.isDurableStore && this.store.putAsync) {
        await this.store.putAsync(record);
      } else {
        this.store.put(record);
      }

      stage = 'persist-refresh-grant';
      if (this.isDurableStore && this.store.createRefreshGrant) {
        await this.store.createRefreshGrant({
          id: crypto.randomUUID(),
          sessionId,
          token: refreshToken,
          issuedAt: issuedAtSession,
          expiresAt: issuedAtSession + REFRESH_TOKEN_LIFETIME_MS,
        });
      }

      // For in-memory store, account persistence is not available
      // This is acceptable for test/dev environments

      return {
        sessionId,
        accessToken,
        refreshToken,
        accessExpiresAt: record.accessExpiresAt,
        refreshExpiresAt: record.refreshExpiresAt,
        actor: {
          actorId,
          username: account.username,
          roles: ['BUYER'],
        },
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      classifyRegisterFailure(stage, error);
      throw error;
    }
  }

  /**
   * Login with username and password.
   *
   * Per M8 Q6: POST /v1/auth/login returns 200 with same session schema as register/refresh (P4).
   * Per Q6 P7: Uniform login failure - every credential failure is uniform 401 UNAUTHENTICATED
   * with no details. Username-not-found and wrong-password failures are indistinguishable.
   * Timing equalization is an implementation requirement.
   *
   * Per Q5.3/Q6 P13: Username format validated (400), 15-char minimum NOT enforced (uniform 401).
   * Per Q5.11: Password is byte-exact, no normalization.
   *
   * Returns same session schema as register/refresh (P4 corrected).
   * Status: 200 OK.
   */
  async login(input: {
    username: string;
    password: string;
  }): Promise<{
    sessionId: string;
    accessToken: string;
    refreshToken: string;
    accessExpiresAt: number;
    refreshExpiresAt: number;
    actor: {
      actorId: string;
      username: string;
      roles: readonly string[];
    };
  }> {
    const startTime = this.now();

    // Normalize username for lookup (Q5.2)
    const normalizedUsername = input.username.toLowerCase().trim();

    // Validate username format (Q5.2, P13)
    const usernameFormatRegex = /^[a-z0-9][a-z0-9_.-]{2,29}$/;
    if (!usernameFormatRegex.test(normalizedUsername)) {
      throw new AppError(
        'VALIDATION_FAILED',
        'Invalid username format.',
        { field: 'username' },
      );
    }

    // Verify credentials (uniform failure per P7)
    let account: {
      id: string;
      username: string;
      usernameNormalized: string;
      roles: readonly string[];
    } | null = null;

    if (this.isDurableStore && this.store.verifyAccountPassword) {
      account = await this.store.verifyAccountPassword(normalizedUsername, input.password);
    }

    // Constant-time delay to prevent timing attacks (P7)
    const elapsed = this.now() - startTime;
    const minDelay = 100; // ms
    if (elapsed < minDelay) {
      // Use proper delay instead of busy wait
      await new Promise((resolve) => setTimeout(resolve, minDelay - elapsed));
    }

    if (!account) {
      // Uniform failure: no details, no distinction between user not found / wrong password (P7)
      throw new AppError(
        'UNAUTHENTICATED',
        'Invalid username or password.',
      );
    }

    // Establish new session
    const issuedAt = this.now();
    const sessionId = crypto.randomUUID();
    const accessToken = mintCredential();
    const refreshToken = mintCredential();

    const record: SessionRecord = {
      sessionId,
      actorId: account.id,
      roles: account.roles as readonly Role[],
      refreshExpiresAt: issuedAt + REFRESH_TOKEN_LIFETIME_MS,
      accessToken,
      accessExpiresAt: issuedAt + ACCESS_TOKEN_LIFETIME_MS,
      refreshToken,
      previousRefreshToken: null,
      refreshRevokedAt: null,
      revokedAt: null,
    };
    if (this.isDurableStore && this.store.putAsync) {
      await this.store.putAsync(record);
    } else {
      this.store.put(record);
    }

    if (this.isDurableStore && this.store.createRefreshGrant) {
      await this.store.createRefreshGrant({
        id: crypto.randomUUID(),
        sessionId,
        token: refreshToken,
        issuedAt,
        expiresAt: issuedAt + REFRESH_TOKEN_LIFETIME_MS,
      });
    }

    return {
      sessionId,
      accessToken,
      refreshToken,
      accessExpiresAt: record.accessExpiresAt,
      refreshExpiresAt: record.refreshExpiresAt,
      actor: {
        actorId: account.id,
        username: account.username,
        roles: account.roles,
      },
    };
  }

  /**
   * Check if a username is reserved (Q5.2).
   * The reserved list should be documented per Q5.2.
   */
  private isReservedUsername(username: string): boolean {
    const reserved = new Set([
      'admin',
      'administrator',
      'root',
      'system',
      'api',
      'www',
      'mail',
      'ftp',
      'support',
      'help',
      'info',
      'noreply',
      'no-reply',
      'postmaster',
      'webmaster',
      'security',
      'abuse',
      'artisan',
      'buyer',
      'reviewer',
      'marketplace',
      'app',
      'mobile',
      'api',
      'cdn',
      'static',
      'assets',
      'media',
      'images',
      'img',
      'css',
      'js',
      'fonts',
    ]);
    return reserved.has(username);
  }

  /**
   * Resolves a presented access credential to its server-side session.
   * Synchronous version for in-memory store.
   */
  verifyAccessToken(
    credential: string | null | undefined,
  ): SessionVerification {
    if (!credential) {
      return { ok: false, reason: 'CREDENTIAL_MISSING' };
    }

    // Sync path (in-memory store)
    for (const record of this.store.all()) {
      if (!constantTimeEquals(credential, record.accessToken)) {
        continue;
      }

      // Per Gate A Q5: access tokens are NOT revoked by logout; they expire naturally.
      // But full revocation (revokeSession) revokes both access and refresh tokens.
      if (record.revokedAt !== null) {
        return { ok: false, reason: 'SESSION_REVOKED' };
      }

      if (this.now() >= record.accessExpiresAt) {
        return { ok: false, reason: 'SESSION_EXPIRED' };
      }

      return {
        ok: true,
        sessionId: record.sessionId,
        actorId: record.actorId,
        roles: [...record.roles],
        accessExpiresAt: record.accessExpiresAt,
      };
    }

    return { ok: false, reason: 'SESSION_UNKNOWN' };
  }

  /**
   * Async version of verifyAccessToken for durable stores.
   * The store handles credential hashing internally.
   */
  async verifyAccessTokenAsync(
    credential: string | null | undefined,
  ): Promise<SessionVerification> {
    if (!credential) {
      return { ok: false, reason: 'CREDENTIAL_MISSING' };
    }

    if (this.isDurableStore && this.store.findByAccessToken) {
      const record = await this.store.findByAccessToken(credential);
      if (!record) {
        return { ok: false, reason: 'SESSION_UNKNOWN' };
      }

      // Per Gate A Q5: access tokens are NOT revoked by logout; they expire naturally.
      // But full revocation (revokeSession) revokes both access and refresh tokens.
      // So check revokedAt (full revocation) but not refreshRevokedAt (logout only).
      if (record.revokedAt !== null) {
        return { ok: false, reason: 'SESSION_REVOKED' };
      }

      if (this.now() >= record.accessExpiresAt) {
        return { ok: false, reason: 'SESSION_EXPIRED' };
      }

      return {
        ok: true,
        sessionId: record.sessionId,
        actorId: record.actorId,
        roles: [...record.roles],
        accessExpiresAt: record.accessExpiresAt,
      };
    }

    // Fallback to sync for in-memory store
    return this.verifyAccessToken(credential);
  }

  /**
   * Exchanges the current single-use refresh credential for a new session
   * credential pair.
   *
   * Rotation is what makes the refresh credential single-use: the record's
   * current values are replaced, so the presented credential stops
   * matching. Replaying the replaced credential is reported as
   * `REFRESH_ALREADY_USED`, which is a different fact from never having
   * existed, and both lead to the same client outcome — sign out.
   *
   * The absolute `refreshExpiresAt` is never recomputed: a refresh issues
   * a new 15-minute access credential but cannot push the 30-day window.
   */
  refresh(credential: string | null | undefined): RefreshOutcome {
    if (!credential) {
      return { ok: false, reason: 'CREDENTIAL_MISSING' };
    }

    // Sync path for in-memory store
    let record: SessionRecord | null = null;

    for (const candidate of this.store.all()) {
      if (constantTimeEquals(credential, candidate.refreshToken)) {
        record = candidate;
        break;
      }
    }

    if (record === null) {
      for (const candidate of this.store.all()) {
        if (
          candidate.previousRefreshToken !== null &&
          constantTimeEquals(credential, candidate.previousRefreshToken)
        ) {
          return { ok: false, reason: 'REFRESH_ALREADY_USED' };
        }
      }

      return { ok: false, reason: 'SESSION_UNKNOWN' };
    }

    if (record.revokedAt !== null || record.refreshRevokedAt !== null) {
      return { ok: false, reason: 'SESSION_REVOKED' };
    }

    if (this.now() >= record.refreshExpiresAt) {
      return { ok: false, reason: 'SESSION_EXPIRED' };
    }

    const rotatedAt = this.now();

    record.previousRefreshToken = record.refreshToken;
    record.refreshToken = mintCredential();
    record.accessToken = mintCredential();
    record.accessExpiresAt = rotatedAt + ACCESS_TOKEN_LIFETIME_MS;

    this.store.put(record);

    return {
      ok: true,
      session: {
        sessionId: record.sessionId,
        accessToken: record.accessToken,
        refreshToken: record.refreshToken,
        accessExpiresAt: record.accessExpiresAt,
        refreshExpiresAt: record.refreshExpiresAt,
        actor: {
          actorId: record.actorId,
          username: record.actorId, // In-memory store doesn't have username; use actorId as fallback
          roles: record.roles,
        },
      },
    };
  }

  /**
   * Async version of refresh for durable stores with proper rotation semantics.
   */
  async refreshAsync(credential: string | null | undefined): Promise<RefreshOutcome> {
    if (!credential) {
      return { ok: false, reason: 'CREDENTIAL_MISSING' };
    }

    if (this.isDurableStore && this.store.rotateRefreshGrant && this.store.findUnconsumedRefreshGrant && this.store.getAsync) {
      // Use durable store's atomic rotation
      // First check if the grant exists and is unconsumed
      const grant = await this.store.findUnconsumedRefreshGrant(credential);

      if (!grant) {
        // Check if it's a replay (consumed grant)
        if (this.store.findRefreshGrant) {
          const consumedGrant = await this.store.findRefreshGrant(credential);
          if (consumedGrant) {
            // Replay detected - revoke the session
            if (this.store.detectReplayAndRevoke) {
              await this.store.detectReplayAndRevoke(credential, this.now());
            }
            return { ok: false, reason: 'REFRESH_ALREADY_USED' };
          }
        }
        return { ok: false, reason: 'SESSION_UNKNOWN' };
      }

      // Check session validity
      const session = await this.store.getAsync(grant.sessionId);
      if (!session) {
        return { ok: false, reason: 'SESSION_UNKNOWN' };
      }

      if (session.revokedAt !== null || session.refreshRevokedAt !== null) {
        return { ok: false, reason: 'SESSION_REVOKED' };
      }

      if (this.now() >= session.refreshExpiresAt) {
        return { ok: false, reason: 'SESSION_EXPIRED' };
      }

      // Check grant expiry
      if (this.now() >= grant.expiresAt) {
        return { ok: false, reason: 'SESSION_EXPIRED' };
      }

      // Perform atomic rotation
      const rotatedAt = this.now();
      const newAccessToken = mintCredential();
      const newRefreshToken = mintCredential();

      const newGrant = {
        id: crypto.randomUUID(),
        sessionId: grant.sessionId,
        refreshToken: newRefreshToken,
        accessToken: newAccessToken,
        issuedAt: rotatedAt,
        expiresAt: session.refreshExpiresAt, // Absolute expiry never changes
      };

      const updatedSession = await this.store.rotateRefreshGrant(
        credential,
        newGrant,
        rotatedAt,
      );

      if (!updatedSession) {
        return { ok: false, reason: 'SESSION_UNKNOWN' };
      }

      // Fetch username from account for the response
      let username = updatedSession.actorId; // fallback
      if (this.store.findAccountById) {
        const account = await this.store.findAccountById(updatedSession.actorId);
        if (account) {
          username = account.username;
        }
      }

      return {
        ok: true,
        session: {
          sessionId: updatedSession.sessionId,
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
          accessExpiresAt: rotatedAt + ACCESS_TOKEN_LIFETIME_MS,
          refreshExpiresAt: updatedSession.refreshExpiresAt,
          actor: {
            actorId: updatedSession.actorId,
            username,
            roles: updatedSession.roles,
          },
        },
      };
    }

    // Fallback to sync for in-memory store
    return this.refresh(credential);
  }

  /**
   * Revokes the current server-side refresh session (M8 Gate A, Q5).
   *
   * Logout ends refreshability immediately and affects this session only.
   * The current access credential is deliberately *not* denylisted: it
   * keeps resolving until its natural 15-minute expiry, exactly as decided.
   * Logout on a session that is already revoked — by logout or by full
   * revocation — reports the revoked state rather than pretending the
   * session is still live.
   */
  logout(credential: string | null | undefined): LogoutOutcome {
    if (!credential) {
      return { ok: false, reason: 'CREDENTIAL_MISSING' };
    }

    if (this.isDurableStore && this.store.findByRefreshToken) {
      // Use async path if available
      return this.logoutAsync(credential) as any;
    }

    // Sync path for in-memory store
    for (const record of this.store.all()) {
      if (!constantTimeEquals(credential, record.refreshToken)) {
        continue;
      }

      if (
        record.revokedAt !== null ||
        record.refreshRevokedAt !== null
      ) {
        return { ok: false, reason: 'SESSION_REVOKED' };
      }

      record.refreshRevokedAt = this.now();
      this.store.put(record);

      return { ok: true, sessionId: record.sessionId };
    }

    return { ok: false, reason: 'SESSION_UNKNOWN' };
  }

  /**
   * Async version of logout for durable stores.
   * The store handles credential hashing internally.
   */
  async logoutAsync(credential: string | null | undefined): Promise<LogoutOutcome> {
    if (!credential) {
      return { ok: false, reason: 'CREDENTIAL_MISSING' };
    }

    if (this.isDurableStore && this.store.findByRefreshToken) {
      const record = await this.store.findByRefreshToken(credential);

      if (!record) {
        return { ok: false, reason: 'SESSION_UNKNOWN' };
      }

      if (
        record.revokedAt !== null ||
        record.refreshRevokedAt !== null
      ) {
        return { ok: false, reason: 'SESSION_REVOKED' };
      }

      // Per Gate A Q5: logout only revokes the refresh session (refreshRevokedAt),
      // not the entire session. The access token remains valid until its natural expiry.
      if (this.store.revokeRefreshSession) {
        await this.store.revokeRefreshSession(record.sessionId, this.now());
      } else if (this.store.putAsync) {
        record.refreshRevokedAt = this.now();
        await this.store.putAsync(record);
      } else {
        record.refreshRevokedAt = this.now();
        this.store.put(record);
      }

      return { ok: true, sessionId: record.sessionId };
    }

    // Fallback to sync
    return this.logout(credential);
  }

  /**
   * Revokes a session entirely: both credentials stop resolving.
   *
   * This is the explicit `session revoked` state ADR-006 requires for a
   * credential, distinct from logout (which leaves the access credential
   * to expire) and distinct from expiry (which happens on its own).
   * Returns `false` when no such session exists, so a caller cannot
   * mistake "nothing to revoke" for "revoked".
   */
  revokeSession(sessionId: string): boolean {
    if (this.isDurableStore && this.store.revokeSession) {
      return this.revokeSessionAsync(sessionId) as any;
    }

    const record = this.store.get(sessionId);

    if (record === null) {
      return false;
    }

    record.revokedAt = this.now();
    this.store.put(record);

    return true;
  }

  /**
   * Async version of revokeSession for durable stores.
   */
  async revokeSessionAsync(sessionId: string): Promise<boolean> {
    if (this.isDurableStore && this.store.revokeSession) {
      return this.store.revokeSession(sessionId, this.now());
    }

    const record = this.store.get(sessionId);

    if (record === null) {
      return false;
    }

    record.revokedAt = this.now();
    this.store.put(record);

    return true;
  }
}