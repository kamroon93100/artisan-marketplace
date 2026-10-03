import { requireActor } from './session.js';
import { AppError } from '../errors/app-error.js';

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

/**
 * Asserts the refusal is an `AppError` with the expected code.
 *
 * When `expectedDetails` is omitted for an `UNAUTHENTICATED` refusal the
 * error must carry no `details` at all, which is the contract for every
 * generic failure: a missing/unknown/invalid credential returns
 * `UNAUTHENTICATED` with no `details.reason`. Only the two deliberate
 * session refusal states pass `expectedDetails`, and the vocabulary they
 * may carry is exactly `SESSION_EXPIRED` / `SESSION_REVOKED`. Other codes
 * keep their existing behavior.
 */
async function expectAppError(
  label: string,
  run: () => unknown | Promise<unknown>,
  code: string,
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

const TOKEN = 'session-token-value';

function productionEnv() {
  return {
    APP_ENV: 'production',
    SESSION_TOKEN: TOKEN,
    SESSION_ACTOR_ID: 'artisan-1',
  };
}

/**
 * A request with no credential must never be resolved to an actor, and
 * must never be resolved to the anonymous actor the request context
 * starts as. It is a generic failure: `UNAUTHENTICATED` with no
 * `details.reason`.
 */
async function testMissingCredentialIsUnauthenticated(): Promise<void> {
  await expectAppError(
    'no authorization header',
    () => requireActor(productionEnv(), undefined),
    'UNAUTHENTICATED',
  );

  await expectAppError(
    'empty authorization header',
    () => requireActor(productionEnv(), '   '),
    'UNAUTHENTICATED',
  );

  await expectAppError(
    'non-bearer authorization header',
    () =>
      requireActor(productionEnv(), TOKEN),
    'UNAUTHENTICATED',
  );

  await expectAppError(
    'bearer prefix with no token',
    () => requireActor(productionEnv(), 'Bearer '),
    'UNAUTHENTICATED',
  );
}

/**
 * A wrong or partial token must not authenticate, and must not be
 * treated as a prefix match.
 */
async function testWrongCredentialIsUnauthenticated(): Promise<void> {
  await expectAppError(
    'wrong token',
    () =>
      requireActor(
        productionEnv(),
        'Bearer not-the-token',
      ),
    'UNAUTHENTICATED',
  );

  await expectAppError(
    'token prefix',
    () =>
      requireActor(
        productionEnv(),
        `Bearer ${TOKEN.slice(0, 5)}`,
      ),
    'UNAUTHENTICATED',
  );

  await expectAppError(
    'token with trailing content',
    () =>
      requireActor(
        productionEnv(),
        `Bearer ${TOKEN}extra`,
      ),
    'UNAUTHENTICATED',
  );
}

/**
 * A deployment that cannot verify a session must refuse the request
 * rather than treat the caller as authorized.
 */
async function testUnconfiguredSessionFailsClosed(): Promise<void> {
  await expectAppError(
    'no session configured at all',
    () =>
      requireActor(
        { APP_ENV: 'production' },
        `Bearer ${TOKEN}`,
      ),
    'DEPENDENCY_FAILED',
  );

  await expectAppError(
    'token without an actor',
    () =>
      requireActor(
        {
          APP_ENV: 'production',
          SESSION_TOKEN: TOKEN,
        },
        `Bearer ${TOKEN}`,
      ),
    'DEPENDENCY_FAILED',
  );

  await expectAppError(
    'actor without a token',
    () =>
      requireActor(
        {
          APP_ENV: 'production',
          SESSION_ACTOR_ID: 'artisan-1',
        },
        `Bearer ${TOKEN}`,
      ),
    'DEPENDENCY_FAILED',
  );

  // The critical case: a deployment outside development that has the
  // local seam configured but no session provider. Honoring the seam
  // here would hand every anonymous caller a real owner identity.
  for (const environment of [
    'production',
    'staging',
    'preview',
    undefined,
  ]) {
    await expectAppError(
      `seam cannot stand in for a missing provider in ${String(environment)}`,
      () =>
        requireActor(
          {
            APP_ENV: environment,
            DEV_OWNER_ID: 'dev-artisan',
          },
          undefined,
        ),
      'DEPENDENCY_FAILED',
    );
  }
}

async function testValidSessionResolvesTheConfiguredActor(): Promise<void> {
  const actor = await requireActor(
    productionEnv(),
    `Bearer ${TOKEN}`,
  );

  assertEqual(
    actor.actorId,
    'artisan-1',
    'a valid session resolves the configured actor',
  );
  assertEqual(
    actor.authenticated,
    true,
    'a valid session resolves an authenticated actor',
  );
  assertEqual(
    actor.roles.length,
    0,
    'roles stay server-controlled and empty in this slice',
  );

  // The scheme is case-insensitive, as bearer tokens are.
  assertEqual(
    (await requireActor(productionEnv(), `bearer ${TOKEN}`)).actorId,
    'artisan-1',
    'the bearer scheme is case-insensitive',
  );
}

/**
 * The local seam exists so the validated vertical slice keeps working
 * without an identity provider. It must be unreachable outside
 * development and test, or it becomes a production authentication
 * bypass.
 */
async function testDevelopmentSeamIsEnvironmentScoped(): Promise<void> {
  assertEqual(
    (await requireActor(
      {
        APP_ENV: 'development',
        DEV_OWNER_ID: 'dev-artisan',
      },
      undefined,
    )).actorId,
    'dev-artisan',
    'development may act as the configured local owner',
  );

  for (const environment of [
    'production',
    'staging',
    'preview',
    undefined,
  ]) {
    // The seam must not authenticate a request that carries no
    // credential, even though the environment has it configured.
    await expectAppError(
      `seam is unreachable in ${String(environment)}`,
      () =>
        requireActor(
          {
            APP_ENV: environment,
            DEV_OWNER_ID: 'dev-artisan',
            SESSION_TOKEN: TOKEN,
            SESSION_ACTOR_ID: 'artisan-1',
          },
          undefined,
        ),
      'UNAUTHENTICATED',
    );

    // And when a real session is presented, the real actor wins: the
    // seam must never masquerade as a session.
    assertEqual(
      (await requireActor(
        {
          APP_ENV: environment,
          DEV_OWNER_ID: 'dev-artisan',
          SESSION_TOKEN: TOKEN,
          SESSION_ACTOR_ID: 'artisan-1',
        },
        `Bearer ${TOKEN}`,
      )).actorId,
      'artisan-1',
      `a real session beats the seam in ${String(environment)}`,
    );
  }

  // The seam is a stand-in for a missing provider, not an override of a
  // configured one.
  assertEqual(
    (await requireActor(
      {
        APP_ENV: 'test',
        DEV_OWNER_ID: 'dev-artisan',
        SESSION_TOKEN: TOKEN,
        SESSION_ACTOR_ID: 'artisan-1',
      },
      `Bearer ${TOKEN}`,
    )).actorId,
    'artisan-1',
    'a valid session is preferred over the local seam',
  );
}

async function main(): Promise<void> {
  await testMissingCredentialIsUnauthenticated();
  await testWrongCredentialIsUnauthenticated();
  await testUnconfiguredSessionFailsClosed();
  await testValidSessionResolvesTheConfiguredActor();
  await testDevelopmentSeamIsEnvironmentScoped();

  console.log('SESSION AUTHENTICATION TESTS PASSED');
}

void main().catch((error) => {
  console.error('SESSION AUTHENTICATION TESTS FAILED');
  console.error(error);
  process.exitCode = 1;
});
