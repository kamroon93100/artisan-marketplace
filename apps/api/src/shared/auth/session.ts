import { AppError } from '../errors/app-error.js';
import type { UnauthenticatedReason } from '../errors/app-error.js';
import { constantTimeEquals } from '../security/constant-time.js';
import type { ActorContext } from '../context/request-context.js';
import { getIdentityService, createIdentityService } from '../../modules/identity/index.js';

export type SessionBindingEnv = {
  APP_ENV?: string;
  /**
   * Local-only seam. It is the identity a request acts as when the API
   * is not running a real session provider. It is deliberately never
   * honored outside development and test.
   */
  DEV_OWNER_ID?: string;
  SESSION_TOKEN?: string;
  /**
   * The identity a valid static session token represents. That legacy
   * binding carries no roles: role assignment belongs to Identity, which
   * resolves authoritative roles from server-side session state.
   */
  SESSION_ACTOR_ID?: string;
  /** Database connection pool for durable session storage (Phase 1B) */
  DB_POOL?: import('pg').Pool;
};

const BEARER_PREFIX = 'bearer ';

/**
 * Environments in which the local seam may stand in for a session
 * provider. Anything else must present a verifiable session.
 */
function allowsDevelopmentSeam(
  environment: string | undefined,
): boolean {
  return (
    environment === 'development' ||
    environment === 'test'
  );
}

function presentedToken(
  header: string | undefined,
): string | null {
  if (!header) {
    return null;
  }

  const trimmed = header.trim();

  if (
    trimmed.length <= BEARER_PREFIX.length ||
    trimmed.slice(0, BEARER_PREFIX.length).toLowerCase() !==
      BEARER_PREFIX
  ) {
    return null;
  }

  const token = trimmed.slice(BEARER_PREFIX.length).trim();

  return token.length > 0 ? token : null;
}

/**
 * Resolves the actor for a request that must not proceed anonymously.
 *
 * Authentication and authorization are separate decisions: this proves
 * who the actor is, and the owning module decides what that actor may
 * do. It never trusts a client-supplied identity, and it fails closed
 * rather than defaulting to an anonymous actor.
 *
 * Session mechanics are owned by Identity (ADR-006): this function asks
 * Identity what a presented credential resolves to, then falls back to the
 * pre-existing checks — configured static session, development/test seam,
 * closed failure — each with exactly the meaning it has today. Business
 * modules keep calling this one boundary and never parse credentials.
 */
export async function requireActor(
  env: SessionBindingEnv,
  authorizationHeader: string | undefined,
): Promise<ActorContext> {
  const token = presentedToken(authorizationHeader);

  // The approved session mechanism (M8 Gate A, A2): a presented
  // credential is resolved against server-side Identity state, and the
  // server — never the credential — supplies the actor id and roles.
  // An environment with no session store gets `null` here and the
  // behavior below is unchanged, which is what keeps the configured
  // static session compatible until the approved mechanism replaces it.
  const identity =
    token === null ? null : createIdentityService(env);

  if (identity) {
    const verification = await identity.verifyAccessTokenAsync(token);

    if (verification.ok) {
      return {
        actorId: verification.actorId,
        roles: verification.roles,
        authenticated: true,
      };
    }

    // Expired and revoked are deliberate refusal states (ADR-006) and
    // must not fall through: a fallback would answer a credential the
    // server already ended with an unrelated identity or with success.
    // A credential Identity does not recognize does fall through, so the
    // static session and the development seam keep their current meaning.
    //
    // M8 error contract (Option A): `UNAUTHENTICATED` remains the wire
    // code for all of these and HTTP 401 remains its status. The two
    // refusal states stay distinguishable through the optional
    // `details.reason`, whose vocabulary is `UnauthenticatedReason`.
    // Generic missing/unknown/invalid authentication below carries no
    // `details` at all.
    if (verification.reason === 'SESSION_EXPIRED') {
      throw new AppError(
        'UNAUTHENTICATED',
        'Session expired.',
        {
          reason: 'SESSION_EXPIRED',
        } satisfies { reason: UnauthenticatedReason },
      );
    }

    if (verification.reason === 'SESSION_REVOKED') {
      throw new AppError(
        'UNAUTHENTICATED',
        'Session revoked.',
        {
          reason: 'SESSION_REVOKED',
        } satisfies { reason: UnauthenticatedReason },
      );
    }
  }

  const expectedToken = env.SESSION_TOKEN?.trim();
  const expectedActorId = env.SESSION_ACTOR_ID?.trim();

  // A configured session provider is always authoritative. The local
  // seam only stands in for a missing provider, so it can never
  // substitute a fake owner for a genuinely authenticated caller.
  if (expectedToken && expectedActorId) {
    // Length-independent comparison: a session token must not be
    // discoverable from response timing.
    if (!token || !constantTimeEquals(token, expectedToken)) {
      throw new AppError(
        'UNAUTHENTICATED',
        'A valid session is required.',
      );
    }

    return {
      actorId: expectedActorId,
      roles: [],
      authenticated: true,
    };
  }

  if (allowsDevelopmentSeam(env.APP_ENV)) {
    const devOwnerId = env.DEV_OWNER_ID?.trim();

    if (devOwnerId) {
      return {
        actorId: devOwnerId,
        roles: [],
        authenticated: true,
      };
    }
  }

  // A deployment that cannot verify a session must not pretend that an
  // unauthenticated caller is authorized. Refusing the request is the
  // only safe answer, and it is a deployment fault, not a client one.
  throw new AppError(
    'DEPENDENCY_FAILED',
    'Session verification is not configured.',
  );
}

/**
 * Synchronous version of requireActor for backward compatibility
 * with in-memory store only environments.
 * @deprecated Use async requireActor instead.
 */
export function requireActorSync(
  env: SessionBindingEnv,
  authorizationHeader: string | undefined,
): ActorContext {
  const token = presentedToken(authorizationHeader);

  const identity =
    token === null ? null : getIdentityService(env);

  if (identity) {
    const verification = identity.verifyAccessToken(token);

    if (verification.ok) {
      return {
        actorId: verification.actorId,
        roles: verification.roles,
        authenticated: true,
      };
    }

    if (verification.reason === 'SESSION_EXPIRED') {
      throw new AppError(
        'UNAUTHENTICATED',
        'Session expired.',
        {
          reason: 'SESSION_EXPIRED',
        } satisfies { reason: UnauthenticatedReason },
      );
    }

    if (verification.reason === 'SESSION_REVOKED') {
      throw new AppError(
        'UNAUTHENTICATED',
        'Session revoked.',
        {
          reason: 'SESSION_REVOKED',
        } satisfies { reason: UnauthenticatedReason },
      );
    }
  }

  const expectedToken = env.SESSION_TOKEN?.trim();
  const expectedActorId = env.SESSION_ACTOR_ID?.trim();

  if (expectedToken && expectedActorId) {
    if (!token || !constantTimeEquals(token, expectedToken)) {
      throw new AppError(
        'UNAUTHENTICATED',
        'A valid session is required.',
      );
    }

    return {
      actorId: expectedActorId,
      roles: [],
      authenticated: true,
    };
  }

  if (allowsDevelopmentSeam(env.APP_ENV)) {
    const devOwnerId = env.DEV_OWNER_ID?.trim();

    if (devOwnerId) {
      return {
        actorId: devOwnerId,
        roles: [],
        authenticated: true,
      };
    }
  }

  throw new AppError(
    'DEPENDENCY_FAILED',
    'Session verification is not configured.',
  );
}