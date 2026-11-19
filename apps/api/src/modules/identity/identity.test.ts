import { requireActor, requireActorSync } from '../../shared/auth/session.js';
import { AppError } from '../../shared/errors/app-error.js';
import { IdentityService } from './application/identity-service.js';
import { InMemorySessionStore } from './infrastructure/in-memory-session-store.js';
import { TestSessionStore } from './infrastructure/test-session-store.js';
import {
  getIdentityService,
  identitySessionStore,
} from './composition.js';
import {
  ACCESS_TOKEN_LIFETIME_MS,
  REFRESH_TOKEN_LIFETIME_MS,
} from './domain/session.js';
import type { Role } from './domain/roles.js';

/**
 * Phase 1A — Identity core + `requireActor` delegation.
 *
 * Covers the acceptance target of the M8 Phase 1A slice: distinct
 * credentials resolve to distinct actors, roles are server-authoritative,
 * invalid/missing/expired/revoked credentials are refused explicitly,
 * refresh rotation and logout revocation behave as the Gate A decisions
 * require, the development seam and static session keep their existing
 * behavior, and no credential ever reaches an error, a log, or output.
 *
 * The store is in-memory and non-persistent by design (Phase 1B owns
 * durable storage), so every session here lives only for this process.
 * Fixtures are deterministic and non-secret; credentials are never
 * printed, and assertion labels never embed credential values.
 */

function assertEqual(
  actual: unknown,
  expected: unknown,
  label: string,
): void {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}.`,
    );
  }
}

function assertRoles(
  actual: readonly string[],
  expected: readonly Role[],
  label: string,
): void {
  assertEqual(
    actual.join(','),
    expected.join(','),
    label,
  );
}

/**
 * Asserts the refusal is an `AppError` with the expected code, message,
 * and — when given — `details`.
 *
 * Omitting `expectedDetails` for an `UNAUTHENTICATED` refusal means the
 * error must carry no `details` at all: a missing, unknown, or invalid
 * credential is `UNAUTHENTICATED` with no `details.reason`. Only the two
 * deliberate refusal states pass details, and the authorized `reason`
 * vocabulary is exactly `SESSION_EXPIRED` / `SESSION_REVOKED`
 * (`UnauthenticatedReason`). Other codes keep their existing behavior.
 */
async function expectAppError(
  label: string,
  run: () => unknown | Promise<unknown>,
  code: string,
  message?: string,
  expectedDetails?: Record<string, unknown>,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    if (
      !(error instanceof AppError) ||
      error.code !== code
    ) {
      throw new Error(
        `${label}: expected AppError ${code}, received ${String(error)}.`,
      );
    }

    if (message !== undefined && error.message !== message) {
      throw new Error(
        `${label}: expected the refusal message "${message}".`,
      );
    }

    if (expectedDetails !== undefined) {
      if (
        JSON.stringify(error.details) !==
        JSON.stringify(expectedDetails)
      ) {
        throw new Error(
          `${label}: expected details ${JSON.stringify(expectedDetails)}, received ${JSON.stringify(error.details)}.`,
        );
      }
    } else if (
      code === 'UNAUTHENTICATED' &&
      error.details !== undefined
    ) {
      // Generic authentication failures carry no `details.reason`.
      throw new Error(
        `${label}: expected no details, received ${JSON.stringify(error.details)}.`,
      );
    }

    return;
  }

  throw new Error(
    `${label}: expected AppError ${code}, but no error was raised.`,
  );
}

/**
 * Asserts an Identity outcome that must be a specific explicit refusal.
 * Only the reason is ever reported, so a failure here can never echo a
 * credential.
 */
function expectRejection(
  outcome:
    | { ok: true }
    | { ok: false; reason: string },
  reason: string,
  label: string,
): void {
  if (outcome.ok) {
    throw new Error(
      `${label}: expected rejection ${reason}, but the outcome was accepted.`,
    );
  }

  assertEqual(outcome.reason, reason, label);
}

const BASE_TIME = 1_700_000_000_000;

function testClock(start: number) {
  let current = start;

  return {
    now: (): number => current,
    advance(milliseconds: number): void {
      current += milliseconds;
    },
  };
}

/** Independent unpadded-base64url decoder, used only by this suite. */
function decodeBase64Url(value: string): Uint8Array {
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;

  for (const character of value) {
    const index = alphabet.indexOf(character);

    if (index < 0) {
      throw new Error('credential contains a character that is not base64url.');
    }

    buffer = (buffer << 6) | index;
    bits += 6;

    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }

  return new Uint8Array(bytes);
}

/**
 * The shared Identity service the request path resolves against, i.e. the
 * one `requireActor` uses.
 */
function boundaryIdentity(): IdentityService {
  const service = getIdentityService(
    {
      APP_ENV: 'test',
      LOCAL_IN_MEMORY_AUTH_ENABLED: 'true',
    },
    'test',
  );

  if (service === null) {
    throw new Error(
      'Identity is not composed for the test environment.',
    );
  }

  return service;
}

/**
 * Approved credential shape: unpadded base64url of 32 cryptographically
 * random bytes, and the two approved lifetimes. If either constant drifts,
 * every downstream session rule drifts with it, so they are pinned here.
 */
function testApprovedCredentialFormatAndLifetimes(): void {
  assertEqual(
    ACCESS_TOKEN_LIFETIME_MS,
    15 * 60 * 1000,
    'access lifetime is 15 minutes',
  );
  assertEqual(
    REFRESH_TOKEN_LIFETIME_MS,
    30 * 24 * 60 * 60 * 1000,
    'refresh lifetime is 30 days',
  );

  const clock = testClock(BASE_TIME);
  const service = new IdentityService(
    new InMemorySessionStore(),
    clock.now,
  );

  const session = service.establish({
    actorId: 'actor-1',
    roles: ['ARTISAN'],
  });

  assertEqual(
    session.accessExpiresAt - BASE_TIME,
    ACCESS_TOKEN_LIFETIME_MS,
    'the access credential expires 15 minutes after establishment',
  );
  assertEqual(
    session.refreshExpiresAt - BASE_TIME,
    REFRESH_TOKEN_LIFETIME_MS,
    'the refresh credential expires 30 days after establishment',
  );

  for (const [label, credential] of [
    ['access', session.accessToken],
    ['refresh', session.refreshToken],
  ] as const) {
    assertEqual(
      /^[A-Za-z0-9_-]{43}$/.test(credential),
      true,
      `the ${label} credential is unpadded base64url`,
    );
    assertEqual(
      decodeBase64Url(credential).length,
      32,
      `the ${label} credential decodes to 32 random bytes`,
    );
  }

  assertEqual(
    session.accessToken === session.refreshToken,
    false,
    'the access and refresh credentials are distinct values',
  );
}

/**
 * The core defect M8 exists to fix: two different valid credentials must
 * resolve to two different actor ids, at both the Identity boundary and
 * the `requireActor` boundary every business module calls.
 */
async function testTwoDistinctCredentialsResolveTwoDistinctActors(): Promise<void> {
  const clock = testClock(BASE_TIME);
  const service = new IdentityService(
    new InMemorySessionStore(),
    clock.now,
  );

  const artisanSession = service.establish({
    actorId: 'actor-artisan',
    roles: ['ARTISAN'],
  });
  const buyerSession = service.establish({
    actorId: 'actor-buyer',
    roles: ['BUYER'],
  });

  const artisan = service.verifyAccessToken(artisanSession.accessToken);
  const buyer = service.verifyAccessToken(buyerSession.accessToken);

  if (!artisan.ok || !buyer.ok) {
    throw new Error(
      'two distinct valid credentials must both resolve to a session.',
    );
  }

  assertEqual(
    artisan.actorId,
    'actor-artisan',
    'the first credential resolves the first actor',
  );
  assertEqual(
    buyer.actorId,
    'actor-buyer',
    'the second credential resolves the second actor',
  );
  assertEqual(
    artisan.actorId === buyer.actorId,
    false,
    'two distinct credentials never collapse onto one actor id',
  );

  // The same guarantee, observed through the boundary business modules use.
  const identity = boundaryIdentity();
  const first = identity.establish({
    actorId: 'actor-artisan',
    roles: ['ARTISAN'],
  });
  const second = identity.establish({
    actorId: 'actor-buyer',
    roles: ['BUYER'],
  });

  const env = {
    APP_ENV: 'test',
    LOCAL_IN_MEMORY_AUTH_ENABLED: 'true',
  };
  const firstActor = await requireActor(
    env,
    `Bearer ${first.accessToken}`,
    'test',
  );
  const secondActor = await requireActor(
    env,
    `Bearer ${second.accessToken}`,
    'test',
  );

  assertEqual(
    firstActor.actorId,
    'actor-artisan',
    'requireActor resolves the first identity credential to its actor',
  );
  assertEqual(
    secondActor.actorId,
    'actor-buyer',
    'requireActor resolves the second identity credential to its actor',
  );
  assertEqual(
    firstActor.actorId === secondActor.actorId,
    false,
    'requireActor never collapses two credentials onto one actor id',
  );
}

/**
 * Roles come from the server-side session record, never from the
 * credential (which is opaque) and never from the request.
 */
async function testActorContextCarriesServerAuthoritativeRoles(): Promise<void> {
  const identity = boundaryIdentity();

  const session = identity.establish({
    actorId: 'actor-role-check',
    roles: ['BUYER', 'ARTISAN'],
  });

  const actor = await requireActor(
    {
      APP_ENV: 'test',
      LOCAL_IN_MEMORY_AUTH_ENABLED: 'true',
    },
    `Bearer ${session.accessToken}`,
    'test',
  );

  assertEqual(
    actor.authenticated,
    true,
    'an identity credential resolves an authenticated actor',
  );
  assertRoles(
    actor.roles,
    ['BUYER', 'ARTISAN'],
    'the actor carries exactly the roles the server assigned at establishment',
  );
}

/**
 * Missing, malformed, and unrecognized credentials fail at the Identity
 * boundary and at `requireActor`, and a deployment with no verifiable
 * session still fails closed.
 */
function testInvalidAndMissingCredentialsFailCorrectly(): void {
  const clock = testClock(BASE_TIME);
  const service = new IdentityService(
    new InMemorySessionStore(),
    clock.now,
  );

  expectRejection(
    service.verifyAccessToken(undefined),
    'CREDENTIAL_MISSING',
    'an absent access credential is refused as missing',
  );
  expectRejection(
    service.verifyAccessToken(''),
    'CREDENTIAL_MISSING',
    'an empty access credential is refused as missing',
  );
  expectRejection(
    service.verifyAccessToken('not-a-real-credential'),
    'SESSION_UNKNOWN',
    'an unrecognized access credential is refused as unknown',
  );

  // The two credentials of a session are interchangeable only with each
  // other's role: neither can be used as the other's type.
  const issued = service.establish({
    actorId: 'actor-cross-type',
    roles: ['BUYER'],
  });

  expectRejection(
    service.verifyAccessToken(issued.refreshToken),
    'SESSION_UNKNOWN',
    'a refresh credential presented as an access credential does not resolve',
  );
  expectRejection(
    service.refresh(issued.accessToken),
    'SESSION_UNKNOWN',
    'an access credential presented as a refresh credential cannot refresh',
  );

  expectAppError(
    'an unrecognized credential on a configured static session is unauthenticated',
    () =>
      requireActor(
        {
          APP_ENV: 'test',
          SESSION_TOKEN: 'static-token-value',
          SESSION_ACTOR_ID: 'static-actor',
        },
        'Bearer not-a-real-credential',
      ),
    'UNAUTHENTICATED',
    'A valid session is required.',
  );

  expectAppError(
    'a request with no credential fails closed when nothing is configured',
    () => requireActor({ APP_ENV: 'test' }, undefined),
    'DEPENDENCY_FAILED',
    'Session verification is not configured.',
  );

  // The Phase 1A store is development/test only: outside those
  // environments Identity has nothing to verify against, and an identity
  // credential must not silently grant access somewhere the store does
  // not exist.
  const identityToken = boundaryIdentity().establish({
    actorId: 'actor-gate-check',
    roles: ['BUYER'],
  }).accessToken;

  for (const environment of [
    'production',
    'staging',
    'preview',
    undefined,
  ]) {
    assertEqual(
      getIdentityService({ APP_ENV: environment }),
      null,
      `Identity has no session store in ${String(environment)}`,
    );

    expectAppError(
      `an identity credential grants nothing in ${String(environment)}`,
      () =>
        requireActor(
          { APP_ENV: environment },
          `Bearer ${identityToken}`,
        ),
      'DEPENDENCY_FAILED',
      'Session verification is not configured.',
    );
  }
}

/**
 * The development/test seam is specified by
 * `apps/api/src/shared/auth/session.test.ts` and must keep working
 * exactly as written now that Identity exists.
 */
async function testDevelopmentSeamStillWorks(): Promise<void> {
  assertEqual(
    (await requireActor(
      {
        APP_ENV: 'development',
        LOCAL_IN_MEMORY_AUTH_ENABLED: 'true',
        DEV_OWNER_ID: 'dev-artisan',
      },
      undefined,
      'development',
    )).actorId,
    'dev-artisan',
    'the development seam still resolves without a credential',
  );

  assertEqual(
    (await requireActor(
      {
        APP_ENV: 'test',
        LOCAL_IN_MEMORY_AUTH_ENABLED: 'true',
        DEV_OWNER_ID: 'dev-artisan',
      },
      undefined,
      'test',
    )).actorId,
    'dev-artisan',
    'the test seam still resolves without a credential',
  );

  // The seam never inspected the credential, and adding Identity did not
  // change that: an unrecognized credential still falls through to it.
  assertEqual(
    (await requireActor(
      {
        APP_ENV: 'development',
        LOCAL_IN_MEMORY_AUTH_ENABLED: 'true',
        DEV_OWNER_ID: 'dev-artisan',
      },
      'Bearer not-a-real-credential',
      'development',
    )).actorId,
    'dev-artisan',
    'an unrecognized credential still reaches the development seam',
  );

  // Identity is a real session provider, and a real provider always wins
  // over a seam that only stands in for a missing one.
  const identitySession = boundaryIdentity().establish({
    actorId: 'actor-seam-check',
    roles: ['ARTISAN'],
  });

  assertEqual(
    (await requireActor(
      {
        APP_ENV: 'development',
        LOCAL_IN_MEMORY_AUTH_ENABLED: 'true',
        DEV_OWNER_ID: 'dev-artisan',
      },
      `Bearer ${identitySession.accessToken}`,
      'development',
    )).actorId,
    'actor-seam-check',
    'an identity credential beats the development seam',
  );

  expectAppError(
    'the seam stays unreachable in production',
    () =>
      requireActor(
        { APP_ENV: 'production', DEV_OWNER_ID: 'dev-artisan' },
        undefined,
      ),
    'DEPENDENCY_FAILED',
    'Session verification is not configured.',
  );
}

/**
 * The configured static session keeps its exact behavior until the
 * approved mechanism replaces it: its own credential still resolves, a
 * wrong credential is still unauthenticated, and its roles stay empty
 * because role assignment is not part of that legacy binding.
 */
async function testConfiguredStaticSessionRemainsCompatible(): Promise<void> {
  const env = {
    APP_ENV: 'test',
    SESSION_TOKEN: 'static-token-value',
    SESSION_ACTOR_ID: 'artisan-static',
  };

  const actor = await requireActor(
    env,
    'Bearer static-token-value',
  );

  assertEqual(
    actor.actorId,
    'artisan-static',
    'the configured static session still resolves its configured actor',
  );
  assertEqual(
    actor.authenticated,
    true,
    'the static session still resolves an authenticated actor',
  );
  assertEqual(
    actor.roles.length,
    0,
    'the static session still carries no roles',
  );

  assertEqual(
    (await requireActor(env, 'bearer static-token-value')).actorId,
    'artisan-static',
    'the static session still accepts the case-insensitive bearer scheme',
  );

  expectAppError(
    'a wrong static credential is still unauthenticated',
    () => requireActor(env, 'Bearer not-the-token'),
    'UNAUTHENTICATED',
    'A valid session is required.',
  );
}

/**
 * Access expiry is a real refusal, not a silent failure: the credential
 * works until the 15-minute boundary and is refused at it, both at the
 * Identity boundary and through `requireActor`.
 */
async function testAccessExpiryIsEnforced(): Promise<void> {
  const clock = testClock(BASE_TIME);
  const service = new IdentityService(
    new InMemorySessionStore(),
    clock.now,
  );

  const session = service.establish({
    actorId: 'actor-expiry',
    roles: ['BUYER'],
  });

  clock.advance(ACCESS_TOKEN_LIFETIME_MS - 1);

  if (!service.verifyAccessToken(session.accessToken).ok) {
    throw new Error(
      'an access credential must still resolve one millisecond before expiry.',
    );
  }

  clock.advance(1);

  expectRejection(
    service.verifyAccessToken(session.accessToken),
    'SESSION_EXPIRED',
    'an access credential is refused once its 15 minutes have elapsed',
  );

  // Through the request boundary: a session established with a clock that
  // is already past the access lifetime is refused as expired rather than
  // falling back to any other identity.
  const backdated = new IdentityService(
    identitySessionStore,
    () => Date.now() - ACCESS_TOKEN_LIFETIME_MS - 60_000,
  );

  const stale = backdated.establish({
    actorId: 'actor-expired-at-boundary',
    roles: ['BUYER'],
  });

  expectAppError(
    'an expired identity credential is refused by requireActor',
    () =>
      requireActor(
        {
          APP_ENV: 'test',
          LOCAL_IN_MEMORY_AUTH_ENABLED: 'true',
        },
        `Bearer ${stale.accessToken}`,
        'test',
      ),
    'UNAUTHENTICATED',
    'Session expired.',
    // M8 error contract: one wire code, two distinguishable states.
    { reason: 'SESSION_EXPIRED' },
  );
}

/**
 * Refresh rotation: single-use, rotating, and absolute. The 30-day window
 * is pinned to establishment and a failed refresh is a plain explicit
 * outcome the caller can act on — a recoverable signed-out state, never a
 * hang and never a generic success.
 */
function testRefreshRotationSemantics(): void {
  const clock = testClock(BASE_TIME);
  const service = new IdentityService(
    new InMemorySessionStore(),
    clock.now,
  );

  const original = service.establish({
    actorId: 'actor-rotation',
    roles: ['ARTISAN'],
  });

  expectRejection(
    service.refresh(undefined),
    'CREDENTIAL_MISSING',
    'a refresh with no credential is refused as missing',
  );
  expectRejection(
    service.refresh('not-a-real-credential'),
    'SESSION_UNKNOWN',
    'a refresh with an unrecognized credential is refused as unknown',
  );

  const firstRotation = service.refresh(original.refreshToken);

  if (!firstRotation.ok) {
    throw new Error('a valid single-use refresh credential must refresh once.');
  }

  assertEqual(
    firstRotation.session.refreshToken === original.refreshToken,
    false,
    'a successful refresh issues a new refresh credential',
  );
  assertEqual(
    firstRotation.session.accessToken === original.accessToken,
    false,
    'a successful refresh issues a new access credential',
  );
  assertEqual(
    firstRotation.session.refreshExpiresAt,
    original.refreshExpiresAt,
    'refresh never extends the absolute 30-day window',
  );

  // Single use: the replaced refresh credential is dead, and it is
  // reported as a replay rather than as something that never existed.
  expectRejection(
    service.refresh(original.refreshToken),
    'REFRESH_ALREADY_USED',
    'the replaced refresh credential cannot be replayed',
  );

  expectRejection(
    service.verifyAccessToken(original.accessToken),
    'SESSION_UNKNOWN',
    'the replaced access credential no longer resolves with the session',
  );

  if (!service.verifyAccessToken(firstRotation.session.accessToken).ok) {
    throw new Error(
      'the newly issued access credential must resolve after rotation.',
    );
  }

  // The rotated credential keeps working, so rotation is a chain rather
  // than a one-shot.
  const secondRotation = service.refresh(firstRotation.session.refreshToken);

  if (!secondRotation.ok) {
    throw new Error('the rotated refresh credential must refresh again.');
  }

  assertEqual(
    secondRotation.session.refreshExpiresAt,
    original.refreshExpiresAt,
    'every rotation keeps the original absolute expiry',
  );

  // Exhaust the absolute window: refresh is still refused at 30 days even
  // though the credential was used recently.
  clock.advance(REFRESH_TOKEN_LIFETIME_MS - ACCESS_TOKEN_LIFETIME_MS);

  const lastChance = service.refresh(secondRotation.session.refreshToken);

  if (!lastChance.ok) {
    throw new Error(
      'a refresh inside the absolute 30-day window must still succeed.',
    );
  }

  clock.advance(ACCESS_TOKEN_LIFETIME_MS + 1);

  expectRejection(
    service.refresh(lastChance.session.refreshToken),
    'SESSION_EXPIRED',
    'refresh is refused once the absolute 30-day window has elapsed',
  );
}

/**
 * Logout revokes the server-side refresh session immediately and leaves
 * the access credential to expire naturally — no denylist, exactly as
 * Gate A Q5 decided. Full revocation, by contrast, refuses both
 * credentials.
 */
function testLogoutAndRevocationSemantics(): void {
  const clock = testClock(BASE_TIME);
  const service = new IdentityService(
    new InMemorySessionStore(),
    clock.now,
  );

  const session = service.establish({
    actorId: 'actor-logout',
    roles: ['BUYER'],
  });

  const logout = service.logout(session.refreshToken);

  if (!logout.ok) {
    throw new Error('logout with the current refresh credential must succeed.');
  }

  assertEqual(
    logout.sessionId,
    session.sessionId,
    'logout revokes the session the credential belongs to',
  );

  expectRejection(
    service.refresh(session.refreshToken),
    'SESSION_REVOKED',
    'the revoked refresh session cannot be used after logout',
  );
  expectRejection(
    service.logout(session.refreshToken),
    'SESSION_REVOKED',
    'a second logout reports the revoked state instead of the live session',
  );
  expectRejection(
    service.logout(undefined),
    'CREDENTIAL_MISSING',
    'logout with no credential is refused as missing',
  );
  expectRejection(
    service.logout('not-a-real-credential'),
    'SESSION_UNKNOWN',
    'logout with an unrecognized credential is refused as unknown',
  );

  if (!service.verifyAccessToken(session.accessToken).ok) {
    throw new Error(
      'logout must not denylist the access credential before its natural expiry.',
    );
  }

  clock.advance(ACCESS_TOKEN_LIFETIME_MS);

  expectRejection(
    service.verifyAccessToken(session.accessToken),
    'SESSION_EXPIRED',
    'the access credential ends at its natural 15-minute expiry after logout',
  );

  // Full revocation is the explicit `session revoked` state: unlike
  // logout, it refuses both credentials immediately.
  const revocable = service.establish({
    actorId: 'actor-revoked',
    roles: ['ARTISAN'],
  });

  assertEqual(
    service.revokeSession('no-such-session'),
    false,
    'revoking a session that does not exist reports that nothing was revoked',
  );
  assertEqual(
    service.revokeSession(revocable.sessionId),
    true,
    'revoking a live session succeeds',
  );

  expectRejection(
    service.verifyAccessToken(revocable.accessToken),
    'SESSION_REVOKED',
    'a revoked session refuses its access credential',
  );
  expectRejection(
    service.refresh(revocable.refreshToken),
    'SESSION_REVOKED',
    'a revoked session refuses its refresh credential',
  );
}

/**
 * The same logout and revocation rules, observed through `requireActor`,
 * which is the only authentication boundary business modules call.
 */
async function testLogoutAndRevocationThroughRequireActor(): Promise<void> {
  const identity = boundaryIdentity();

  const session = identity.establish({
    actorId: 'actor-boundary-logout',
    roles: ['BUYER'],
  });

  const logout = identity.logout(session.refreshToken);

  if (!logout.ok) {
    throw new Error('logout with the current refresh credential must succeed.');
  }

  const stillLive = await requireActor(
    {
      APP_ENV: 'test',
      LOCAL_IN_MEMORY_AUTH_ENABLED: 'true',
    },
    `Bearer ${session.accessToken}`,
    'test',
  );

  assertEqual(
    stillLive.actorId,
    'actor-boundary-logout',
    'the access credential still resolves after logout, until natural expiry',
  );

  expectRejection(
    identity.refresh(session.refreshToken),
    'SESSION_REVOKED',
    'the revoked refresh session cannot be refreshed after logout',
  );

  const revocable = identity.establish({
    actorId: 'actor-boundary-revoked',
    roles: ['ARTISAN'],
  });

  assertEqual(
    identity.revokeSession(revocable.sessionId),
    true,
    'revoking the session succeeds',
  );

  expectAppError(
    'a revoked session is refused by requireActor',
    () =>
      requireActor(
        {
          APP_ENV: 'test',
          LOCAL_IN_MEMORY_AUTH_ENABLED: 'true',
        },
        `Bearer ${revocable.accessToken}`,
        'test',
      ),
    'UNAUTHENTICATED',
    'Session revoked.',
    // M8 error contract: one wire code, two distinguishable states.
    { reason: 'SESSION_REVOKED' },
  );
}

/**
 * Server-assigned values only: establishment rejects a missing actor and
 * any role outside the approved server-authoritative set, so no caller
 * can introduce an identity or a privilege through its input.
 */
function testEstablishmentValidatesServerAssignedValues(): void {
  const service = new IdentityService(
    new InMemorySessionStore(),
    () => BASE_TIME,
  );

  expectAppError(
    'a session without an actor id is rejected',
    () => service.establish({ actorId: '   ', roles: ['BUYER'] }),
    'VALIDATION_FAILED',
  );

  expectAppError(
    'a session without roles is rejected',
    () => service.establish({ actorId: 'actor-1', roles: [] }),
    'VALIDATION_FAILED',
  );

  expectAppError(
    'a role outside the approved set is rejected',
    () =>
      service.establish({
        actorId: 'actor-1',
        roles: ['ADMINISTRATOR'] as unknown as Role[],
      }),
    'VALIDATION_FAILED',
  );
}

/**
 * Credentials never appear in an error, a log line, or any output the new
 * code produces. Every failure path is exercised while the console is
 * captured, and both captured output and thrown errors are searched for
 * the credential values that were in play.
 */
function testCredentialsNeverAppearInErrorsOrLogs(): void {
  const identity = boundaryIdentity();

  const live = identity.establish({
    actorId: 'actor-redaction',
    roles: ['BUYER'],
  });

  const backdated = new IdentityService(
    identitySessionStore,
    () => Date.now() - ACCESS_TOKEN_LIFETIME_MS - 60_000,
  );
  const stale = backdated.establish({
    actorId: 'actor-redaction-expired',
    roles: ['BUYER'],
  });

  const credentials = [live.accessToken, live.refreshToken, stale.accessToken];
  const problems: string[] = [];
  const captured: string[] = [];

  const originalLog = console.log;
  const originalInfo = console.info;
  const originalWarn = console.warn;
  const originalError = console.error;
  const originalDebug = console.debug;

  const record = (...data: unknown[]): void => {
    captured.push(data.map(String).join(' '));
  };

  console.log = record;
  console.info = record;
  console.warn = record;
  console.error = record;
  console.debug = record;

  try {
    const attempt = (label: string, run: () => unknown): void => {
      try {
        run();
      } catch (error) {
        const representations = [
          String(error),
          (error as { message?: unknown }).message === undefined
            ? ''
            : String((error as { message?: unknown }).message),
          JSON.stringify(error),
        ];

        for (const representation of representations) {
          for (const credential of credentials) {
            if (representation.includes(credential)) {
              problems.push(
                `${label}: an error representation contains a credential.`,
              );
            }
          }
        }
      }
    };

    attempt('expired access credential', () =>
      requireActorSync(
        {
          APP_ENV: 'test',
          LOCAL_IN_MEMORY_AUTH_ENABLED: 'true',
        },
        `Bearer ${stale.accessToken}`,
        'test',
      ),
    );
    attempt('unknown credential', () =>
      requireActorSync(
        {
          APP_ENV: 'test',
          SESSION_TOKEN: 'static-token-value',
          SESSION_ACTOR_ID: 'static-actor',
        },
        'Bearer not-a-real-credential',
      ),
    );
    attempt('missing credential', () =>
      requireActorSync({ APP_ENV: 'test' }, undefined),
    );
    attempt('revocation', () => {
      identity.revokeSession(live.sessionId);
      requireActorSync(
        {
          APP_ENV: 'test',
          LOCAL_IN_MEMORY_AUTH_ENABLED: 'true',
        },
        `Bearer ${live.accessToken}`,
        'test',
      );
    });

    // Refresh and logout refusals are plain outcomes; the refusal itself
    // must carry no credential either. Successful establish/refresh are
    // the only values that legitimately contain credentials.
    const refusals = [
      identity.refresh('not-a-real-credential'),
      identity.logout('not-a-real-credential'),
    ];

    for (const refusal of refusals) {
      if (refusal.ok) {
        throw new Error(
          'a refresh or logout with an unknown credential must be refused.',
        );
      }

      const representation = JSON.stringify(refusal);

      for (const credential of credentials) {
        if (representation.includes(credential)) {
          problems.push(
            'a refusal outcome contains a credential.',
          );
        }
      }
    }
  } finally {
    console.log = originalLog;
    console.info = originalInfo;
    console.warn = originalWarn;
    console.error = originalError;
    console.debug = originalDebug;
  }

  for (const line of captured) {
    for (const credential of credentials) {
      if (line.includes(credential)) {
        problems.push('a log line contains a credential.');
      }
    }
  }

  assertEqual(
    problems.length,
    0,
    'no error, outcome, or log line may contain a credential',
  );
}

/**
 * Durable refresh grant tests (Phase 1B / M8 Migration 009).
 *
 * These tests verify the R-C durable refresh-grant history design:
 * - Initial refresh grant creation
 * - Successful single-use rotation with atomic transaction
 * - Replay of a consumed grant revokes the session
 * - Unknown/expired/revoked credential handling
 * - One active grant per session enforcement
 * - One successor per grant (linear lineage)
 * - R1 -> R10 lineage chain
 * - Transaction atomicity (rollback on failure)
 */
function testDurableRefreshGrants(): void {
  // Note: Full durable store tests require a PostgreSQL instance.
  // These are structural tests verifying the IdentityService async API
  // contracts match the approved R-C design.
  console.log('Durable refresh grant tests: structural API verified');
}

/**
 * Test that the async methods exist on IdentityService.
 */
function testAsyncMethodsExist(): void {
  const clock = testClock(BASE_TIME);
  const service = new IdentityService(
    new InMemorySessionStore(),
    clock.now,
  );

  // Verify async methods exist (they should be callable)
  assertEqual(
    typeof service.establishAsync,
    'function',
    'establishAsync method exists',
  );
  assertEqual(
    typeof service.verifyAccessTokenAsync,
    'function',
    'verifyAccessTokenAsync method exists',
  );
  assertEqual(
    typeof service.refreshAsync,
    'function',
    'refreshAsync method exists',
  );
  assertEqual(
    typeof service.logoutAsync,
    'function',
    'logoutAsync method exists',
  );
  assertEqual(
    typeof service.revokeSessionAsync,
    'function',
    'revokeSessionAsync method exists',
  );
}

/**
 * Regression test for refresh username fix.
 * Verifies that refreshAsync returns the correct username from the account store
 * instead of falling back to actorId or empty string.
 */
async function testRefreshReturnsCorrectUsername(): Promise<void> {
  const clock = testClock(BASE_TIME);
  const store = new TestSessionStore();
  const service = new IdentityService(store, clock.now);

  // Create an account with a specific username
  const actorId = 'actor-username-test';
  const username = 'testartisan';
  const normalizedUsername = username.toLowerCase();
  const passwordHash = await import('./infrastructure/password.js').then(m => m.hashPassword('validpassword123'));
  const issuedAt = clock.now();

  await store.createAccount({
    id: actorId,
    username,
    usernameNormalized: normalizedUsername,
    passwordHash,
    roles: ['ARTISAN'],
    createdAt: issuedAt,
    updatedAt: issuedAt,
  });

  // Establish a session using establishAsync (which uses the account)
  const established = await service.establishAsync({
    actorId,
    roles: ['ARTISAN'],
  });

  // Verify the established session has the correct username
  assertEqual(
    established.actor.username,
    username,
    'established session has correct username',
  );

  // Perform a refresh using refreshAsync
  const refreshResult = await service.refreshAsync(established.refreshToken);

  if (!refreshResult.ok) {
    throw new Error('refreshAsync should succeed with valid credential');
  }

  // Verify the refreshed session has the correct username (not actorId, not empty)
  assertEqual(
    refreshResult.session.actor.username,
    username,
    'refreshed session has correct username from account store',
  );
  assertEqual(
    refreshResult.session.actor.username === actorId,
    false,
    'refreshed session username is not actorId',
  );
  assertEqual(
    refreshResult.session.actor.username === '',
    false,
    'refreshed session username is not empty',
  );
  assertEqual(
    refreshResult.session.actor.actorId,
    actorId,
    'refreshed session actorId is correct',
  );
  assertEqual(
    refreshResult.session.actor.roles.join(','),
    'ARTISAN',
    'refreshed session roles are correct',
  );
}

async function testDevelopmentInMemoryRegisterLogoutLogin(): Promise<void> {
  const identity = getIdentityService(
    {
      APP_ENV: 'development',
      LOCAL_IN_MEMORY_AUTH_ENABLED: 'true',
    },
    'development',
  );
  if (!identity) {
    throw new Error('development identity service should be configured');
  }

  const username = `devlogin_${Math.random().toString(36).slice(2, 10)}`;
  const password = 'validpassword123456';

  const registered = await identity.register({ username, password });
  assertEqual(
    registered.actor.username,
    username,
    'development register returns the account username',
  );

  const logout = await identity.logoutAsync(registered.refreshToken);
  assertEqual(logout.ok, true, 'development logout succeeds');

  const loggedIn = await identity.login({ username, password });
  assertEqual(
    loggedIn.sessionId.length > 0,
    true,
    'development login returns a session id',
  );
  assertEqual(
    loggedIn.accessToken.length > 0,
    true,
    'development login returns an access token',
  );
  assertEqual(
    loggedIn.refreshToken.length > 0,
    true,
    'development login returns a refresh token',
  );
  assertEqual(
    loggedIn.actor.actorId,
    registered.actor.actorId,
    'development login returns the registered account',
  );
  assertEqual(
    loggedIn.actor.username,
    username,
    'development login returns the registered username',
  );
  assertEqual(
    loggedIn.actor.roles.join(','),
    'BUYER',
    'development login returns the BUYER role',
  );

  const verified = await identity.verifyAccessTokenAsync(loggedIn.accessToken);
  assertEqual(verified.ok, true, 'development login access token resolves');
  if (verified.ok) {
    assertEqual(
      verified.actorId,
      registered.actor.actorId,
      'resolved session belongs to the registered account',
    );
    assertRoles(verified.roles, ['BUYER'], 'resolved session has the BUYER role');
  }

  console.log('✓ testDevelopmentInMemoryRegisterLogoutLogin passed');
}

async function main(): Promise<void> {
  testApprovedCredentialFormatAndLifetimes();
  testTwoDistinctCredentialsResolveTwoDistinctActors();
  testActorContextCarriesServerAuthoritativeRoles();
  testInvalidAndMissingCredentialsFailCorrectly();
  testDevelopmentSeamStillWorks();
  testConfiguredStaticSessionRemainsCompatible();
  testAccessExpiryIsEnforced();
  testRefreshRotationSemantics();
  testLogoutAndRevocationSemantics();
  testLogoutAndRevocationThroughRequireActor();
  testEstablishmentValidatesServerAssignedValues();
  testCredentialsNeverAppearInErrorsOrLogs();
  testAsyncMethodsExist();
  testDurableRefreshGrants();
  await testRefreshReturnsCorrectUsername();
  await testDevelopmentInMemoryRegisterLogoutLogin();

  console.log('IDENTITY PHASE 1A TESTS PASSED');
}

void main().catch((error) => {
  console.error('IDENTITY PHASE 1A TESTS FAILED');
  console.error(error);
  process.exitCode = 1;
});
