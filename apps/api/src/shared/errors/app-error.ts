export type ErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'VALIDATION_FAILED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'DEPENDENCY_FAILED'
  | 'TRANSIENT_FAILURE'
  | 'INTERNAL_ERROR';

/**
 * Machine-readable `details.reason` vocabulary for an `UNAUTHENTICATED`
 * error at the protected-route boundary (M8 error contract, Option A).
 *
 * `UNAUTHENTICATED` stays the single wire code for authentication failure
 * and HTTP 401 stays its status. The two deliberate refusal states
 * ADR-006 requires — session expired and session revoked — are
 * distinguished by this optional value, which is exactly these two
 * literals and nothing else.
 *
 * Generic missing, unknown, malformed, or otherwise invalid
 * authentication carries no `details` and therefore no
 * `details.reason`. Nothing else in the error contract may add a
 * `reason`, and the value never contains a credential.
 */
export type UnauthenticatedReason =
  | 'SESSION_EXPIRED'
  | 'SESSION_REVOKED';

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
