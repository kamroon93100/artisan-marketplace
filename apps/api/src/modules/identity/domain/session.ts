import type { Role } from './roles.js';

/**
 * Approved lifetimes (M8 Gate A, Q3).
 *
 * Access: 15 minutes. Refresh: 30 days absolute — a refresh issues a new
 * access credential but never extends the 30-day window, which is pinned
 * to the moment the session was established.
 */
export const ACCESS_TOKEN_LIFETIME_MS = 15 * 60 * 1000;

export const REFRESH_TOKEN_LIFETIME_MS =
  30 * 24 * 60 * 60 * 1000;

/**
 * Server-side session state.
 *
 * This is the authoritative record: the client holds only the two opaque
 * credentials, and every decision about them is made here. Times are epoch
 * milliseconds so the record is comparable without a date dependency.
 *
 * `accessToken`/`refreshToken` hold the *current* credentials only.
 * Rotation replaces them, which is what makes a refresh credential
 * single-use: the previous value stops matching the record.
 */
export type SessionRecord = {
  readonly sessionId: string;
  readonly actorId: string;
  /** Server-stored, server-assigned roles (Gate A Q7, Choice A). */
  readonly roles: readonly Role[];
  /** Absolute end of the refresh window; never extended by refresh. */
  readonly refreshExpiresAt: number;
  accessToken: string;
  accessExpiresAt: number;
  refreshToken: string;
  /**
   * The refresh credential rotation just replaced — the previous
   * generation only, kept so that a replayed credential is reported as a
   * rotation replay rather than as an unknown credential; it grants
   * nothing. A credential from older generations is not retained and is
   * reported as `SESSION_UNKNOWN`.
   */
  previousRefreshToken: string | null;
  /** Set by logout: the refresh session is revoked (Gate A Q5). */
  refreshRevokedAt: number | null;
  /** Set by full revocation: both credentials stop resolving. */
  revokedAt: number | null;
};

/**
 * Why an access credential did not resolve.
 *
 * ADR-006 requires `unauthenticated`, `session expired`, and `session
 * revoked` to be explicit states that are never collapsed into a generic
 * success or a silent failure. These are those states, kept as values so
 * callers can distinguish them; `requireActor` maps every one of them onto
 * the existing `UNAUTHENTICATED` error code, which is the only
 * authentication code the error contract has.
 */
export type SessionRejectionReason =
  | 'CREDENTIAL_MISSING'
  | 'SESSION_UNKNOWN'
  | 'SESSION_EXPIRED'
  | 'SESSION_REVOKED';

export type RefreshRejectionReason =
  | SessionRejectionReason
  | 'REFRESH_ALREADY_USED';

/**
 * Credentials handed to the client when a session is established or
 * refreshed. This object is the only place plaintext credentials appear,
 * and it is never logged.
 */
export type IssuedSession = {
  readonly sessionId: string;
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly accessExpiresAt: number;
  readonly refreshExpiresAt: number;
  readonly actor: {
    readonly actorId: string;
    readonly username: string;
    readonly roles: readonly Role[];
  };
};

export type SessionVerification =
  | {
      ok: true;
      sessionId: string;
      actorId: string;
      roles: readonly Role[];
      accessExpiresAt: number;
    }
  | { ok: false; reason: SessionRejectionReason };

export type RefreshOutcome =
  | { ok: true; session: IssuedSession }
  | { ok: false; reason: RefreshRejectionReason };

export type LogoutOutcome =
  | { ok: true; sessionId: string }
  | { ok: false; reason: SessionRejectionReason };
