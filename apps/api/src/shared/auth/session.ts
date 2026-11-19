import { AppError } from '../errors/app-error.js';
import type { UnauthenticatedReason } from '../errors/app-error.js';
import { constantTimeEquals } from '../security/constant-time.js';
import type { ActorContext } from '../context/request-context.js';
import { allowsLocalInMemoryAuthState } from '../context/auth-state-policy.js';
import {
  getIdentityService,
  createIdentityService,
  hasSessionStoreConfigured,
  allowsInMemorySessionStore,
} from '../../modules/identity/index.js';
import type { SessionVerification } from '../../modules/identity/index.js';
import type { PostgresConnectionValue } from '../persistence/postgres-connection.js';

export type SessionBindingEnv = {
  APP_ENV?: string;
  /**
   * Local-only opt-in for process-local authentication state. The local
   * seam is never honored unless this is exactly `true`, the application
   * environment is explicitly local/test, and the build mode matches.
   */
  LOCAL_IN_MEMORY_AUTH_ENABLED?: string;
  /**
   * Local-only seam. It is the identity a request acts as when the API
   * is not running a real session provider. It is deliberately never
   * honored outside a policy-approved local development or test run.
   */
  DEV_OWNER_ID?: string;
  SESSION_TOKEN?: string;
  /**
   * The identity a valid static session token represents. That legacy
   * binding carries no roles: role assignment belongs to Identity, which
   * resolves authoritative roles from server-side session state.
   */
  SESSION_ACTOR_ID?: string;
  /**
   * Injected pool seam for tests and proofs. A deployed Worker never
   * receives it; it carries `HYPERDRIVE` instead (below).
   */
  DB_POOL?: import('pg').Pool;
  /**
   * The database binding a deployed Worker actually receives. Identity
   * resolves its PostgreSQL session store from it, so it is also what
   * tells this boundary that a session *can* be verified here.
   */
  HYPERDRIVE?: PostgresConnectionValue;
};

const BEARER_PREFIX = 'bearer ';

/**
 * Whether the local seam may stand in for a session provider.
 *
 * This is the same shared decision that governs in-memory limiters and
 * session storage: an explicit local application environment, the local-only
 * opt-in, and an explicitly matching non-production build mode. Anything
 * else must present a verifiable session or fail closed.
 */
function allowsDevelopmentSeam(
  env: SessionBindingEnv,
  buildMode: string | undefined,
): boolean {
  return allowsLocalInMemoryAuthState(env, buildMode);
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
 * The refusal for a request that reached the end of the fallback without
 * resolving to an actor.
 *
 * M8 Phase 1: "Unauthenticated requests to protected routes receive 401
 * (`UNAUTHENTICATED`); a deployment that cannot verify a session still
 * fails closed (`DEPENDENCY_FAILED`) outside development/test."
 *
 * The two answers mean genuinely different things:
 *
 * - A request whose credential a real session store just refused — or one
 *   that arrives where a session store is configured (the `DB_POOL`
 *   seam, or the `HYPERDRIVE` binding a deployed Worker receives) — is an
 *   *authentication* failure: that deployment can verify a session, so
 *   the client gets the generic `UNAUTHENTICATED` (HTTP 401, no
 *   `details`) it can act on: present a valid credential or sign in
 *   again. Answering `DEPENDENCY_FAILED` here would tell the client the
 *   server is broken when in fact it either refused the credential or
 *   never received one.
 * - A request that reaches this point with no store and no static binding
 *   is a *deployment* fault: there is nothing to verify a session against,
 *   so the request is refused with `DEPENDENCY_FAILED` rather than being
 *   handed an identity it never proved.
 *
 * The configured static session and the development/test seam are still
 * consulted first and keep exactly the meaning they have today.
 */
function refusalForUnresolvedRequest(
  env: SessionBindingEnv,
  refusedBySessionStore: boolean,
): AppError {
  const canVerifySession =
    refusedBySessionStore || hasSessionStoreConfigured(env);

  if (canVerifySession) {
    return new AppError(
      'UNAUTHENTICATED',
      'A valid session is required.',
    );
  }

  return new AppError(
    'DEPENDENCY_FAILED',
    'Session verification is not configured.',
  );
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
  buildMode: string | undefined = process.env.NODE_ENV,
): Promise<ActorContext> {
  const token = presentedToken(authorizationHeader);

  // The approved session mechanism (M8 Gate A, A2): a presented
  // credential is resolved against server-side Identity state, and the
  // server — never the credential — supplies the actor id and roles.
  // An environment with no session store gets `null` here and the
  // behavior below is unchanged, which is what keeps the configured
  // static session compatible until the approved mechanism replaces it.
  const identity =
    token === null ? null : createIdentityService(env, buildMode);

  // True once a real session store has looked at this credential and not
  // recognized it. From that moment the deployment has demonstrated that
  // it *can* verify a session, so the end of the fallback must answer 401
  // rather than reporting that verification is unavailable (M8 Phase 1).
  let refusedBySessionStore = false;

  if (identity) {
    // A store that cannot answer is a persistence failure, not an
    // authentication failure: the deployment is configured to verify
    // sessions and just cannot reach the database. Without this guard a
    // raw driver error would escape to the error handler as a 500,
    // losing the `DEPENDENCY_FAILED` class that says "retry later"
    // (M8 task contract P16).
    let verification: SessionVerification;

    try {
      verification = await identity.verifyAccessTokenAsync(token);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      // The cause is recorded here because the `AppError` below is
      // handled as a refusal by the error mapper rather than as an
      // unexpected error, so nothing else would log it: a store outage
      // must still be diagnosable (AGENTS.md §12). No credential and no
      // connection string is logged.
      console.error(
        '[identity] session store unavailable:',
        error instanceof Error ? error.message : String(error),
      );

      throw new AppError(
        'DEPENDENCY_FAILED',
        'Session verification is temporarily unavailable.',
      );
    }

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

    // `SESSION_UNKNOWN` / `CREDENTIAL_MISSING`: the store answered, so
    // this deployment can verify a session. The credential still falls
    // through to the legacy seams below, but if nothing resolves it the
    // answer is a client-visible 401, never "verification unavailable".
    refusedBySessionStore = true;
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

  if (allowsDevelopmentSeam(env, buildMode)) {
    const devOwnerId = env.DEV_OWNER_ID?.trim();

    if (devOwnerId) {
      return {
        actorId: devOwnerId,
        roles: [],
        authenticated: true,
      };
    }
  }

  // Nothing resolved this request, and it must never proceed as the
  // anonymous actor. Refusing is the only safe answer; the code says
  // whether that refusal is a credential the server could judge (401) or
  // a deployment with no way to verify a session at all
  // (DEPENDENCY_FAILED, a deployment fault rather than a client one).
  throw refusalForUnresolvedRequest(env, refusedBySessionStore);
}

/**
 * Synchronous version of requireActor for backward compatibility
 * with in-memory store only environments.
 *
 * It cannot verify durable sessions: every durable read is asynchronous,
 * so where sessions live in PostgreSQL this boundary refuses explicitly
 * (`DEPENDENCY_FAILED`) rather than reporting a verification it never
 * performed. The configured static session and the development seam,
 * both synchronous, keep answering exactly as they do today.
 *
 * @deprecated Use async requireActor instead.
 */
export function requireActorSync(
  env: SessionBindingEnv,
  authorizationHeader: string | undefined,
  buildMode: string | undefined = process.env.NODE_ENV,
): ActorContext {
  const token = presentedToken(authorizationHeader);

  const identity =
    token === null ? null : getIdentityService(env, buildMode);

  // `getIdentityService` (the alias of `createIdentityService`) returns
  // a PostgreSQL-backed service only when the shared policy denies the
  // in-memory store. For that store the only synchronous method is `all()`,
  // a stub that never queries the database: consulting it would refuse
  // valid sessions and strip the expired/revoked reasons, so it is not
  // consulted at all.
  const durableIdentity =
    identity !== null &&
    !allowsInMemorySessionStore(env, buildMode);

  // Same meaning as in `requireActor`: the store judged this credential
  // and did not recognize it, so this deployment can verify a session.
  let refusedBySessionStore = false;

  if (identity && !durableIdentity) {
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

    refusedBySessionStore = true;
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

  if (allowsDevelopmentSeam(env, buildMode)) {
    const devOwnerId = env.DEV_OWNER_ID?.trim();

    if (devOwnerId) {
      return {
        actorId: devOwnerId,
        roles: [],
        authenticated: true,
      };
    }
  }

  // A credential was presented and the only store that could judge it is
  // durable, which this synchronous path cannot consult. The asynchronous
  // `requireActor` — the boundary every business module uses — is the one
  // that verifies durable sessions; this refusal keeps the failure
  // vocabulary honest instead of answering with a judgment never made.
  if (durableIdentity) {
    throw new AppError(
      'DEPENDENCY_FAILED',
      'Synchronous session verification is not available for durable session storage.',
    );
  }

  // Nothing resolved this request, and it must never proceed as the
  // anonymous actor. Refusing is the only safe answer; the code says
  // whether that refusal is a credential the server could judge (401) or
  // a deployment with no way to verify a session at all
  // (DEPENDENCY_FAILED, a deployment fault rather than a client one).
  throw refusalForUnresolvedRequest(env, refusedBySessionStore);
}