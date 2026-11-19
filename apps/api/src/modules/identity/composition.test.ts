import app from '../../index.js';
import type { Pool as PgPool } from 'pg';
import { AppError } from '../../shared/errors/app-error.js';
import {
  requireActor,
  requireActorSync,
} from '../../shared/auth/session.js';
import {
  allowsInMemorySessionStore,
  createIdentityService,
  createPostgresSessionStore,
  createSessionStoreConnection,
  hasSessionStoreConfigured,
  resolveIdentityConnection,
} from './composition.js';

// Route-level fixtures cannot pass a build mode through `app.request`.
// This focused file runs in the test build; unit-level assertions below pass
// explicit modes so production selection never depends on this value.
process.env.NODE_ENV = 'test';

/**
 * M8 §10 Phase 1 — the request environment must be able to obtain the
 * PostgreSQL-backed session store through the binding a deployed Worker
 * actually receives.
 *
 * A deployed Worker is given `HYPERDRIVE`, never `DB_POOL`. `DB_POOL` is
 * a test seam that a proof can inject into an environment object; nothing
 * in the Worker request path ever sets it. Without the wiring proven
 * here, `createIdentityService` returns `null` in production shape and
 * every protected route answers 503 `DEPENDENCY_FAILED` — a deployment
 * fault code for a deployment that is in fact fully configured.
 *
 * These tests are deliberately service-free:
 *
 *  - the connection string never targets a live database, because the
 *    cases below never present a credential (an unrecognized credential
 *    would consult the store and attempt a connection);
 *  - `APP_ENV` is `production`, so `allowsInMemorySessionStore` is false
 *    and the in-memory store cannot answer for the missing wiring;
 *  - the static `SESSION_TOKEN`/`SESSION_ACTOR_ID` binding and the
 *    `DEV_OWNER_ID` seam are unset for the production-shaped cases, so no
 *    legacy seam can mask the gap.
 *
 * The durable, live-PostgreSQL half of this acceptance item is proven by
 * `tests/m8-db-wiring/` via
 * `scripts/verify-m8-db-wiring-postgres.ps1`, which shows a real
 * credential resolving against real PostgreSQL through the HYPERDRIVE
 * binding alone.
 *
 * Registered in `scripts/verify.ps1` (service-free fast path).
 */

const PRODUCTION_SHAPED = {
  APP_ENV: 'production',
  HYPERDRIVE: {
    connectionString:
      'postgresql://wiring-unit-test@127.0.0.1:55432/artisan_marketplace_wiring',
  },
} as const;

/**
 * A binding that is configured but cannot answer: loopback port 1 refuses
 * every connection, so a request that consults the store fails the way a
 * database outage fails — quickly, and without any service running.
 */
const STORE_DOWN = {
  APP_ENV: 'production',
  HYPERDRIVE: {
    connectionString: 'postgresql://wiring-unit-test@127.0.0.1:1/artisan_marketplace_wiring',
  },
} as const;

const PROTECTED_PATH = '/catalog/products/wiring-proof-product';

function bearer(credential: string): string {
  return `Bearer ${credential}`;
}

/**
 * Failure messages name the environment without printing it: a
 * connection string can carry production credentials, so only the
 * presence of a binding is reported.
 */
function describeEnv(env: object): string {
  const redacted: Record<string, unknown> = { ...env };

  if ('HYPERDRIVE' in redacted) {
    redacted.HYPERDRIVE = '[binding]';
  }

  if ('DB_POOL' in redacted) {
    redacted.DB_POOL = '[pool]';
  }

  return JSON.stringify(redacted);
}

async function expectAppError(
  label: string,
  run: () => unknown | Promise<unknown>,
  code: string,
  expectedMessage?: string,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    if (!(error instanceof AppError)) {
      throw new Error(
        `${label}: expected an AppError, received ${String(error)}.`,
      );
    }

    if (error.code !== code) {
      throw new Error(
        `${label}: expected ${code}, received ${error.code}.`,
      );
    }

    if (expectedMessage !== undefined && error.message !== expectedMessage) {
      throw new Error(
        `${label}: expected the documented refusal message, received ${error.message}.`,
      );
    }

    return;
  }

  throw new Error(`${label}: expected ${code}, but no error was raised.`);
}

/**
 * AC2: the production-shaped environment resolves a real session store
 * from `HYPERDRIVE` instead of returning `null`.
 */
async function testProductionShapeObtainsASessionStore(): Promise<void> {
  if (allowsInMemorySessionStore(PRODUCTION_SHAPED, 'production')) {
    throw new Error(
      'Precondition failed: production must not admit the in-memory session store.',
    );
  }

  const identity = createIdentityService(PRODUCTION_SHAPED, 'production');

  if (identity === null) {
    throw new Error(
      'createIdentityService returned null for an environment that has the HYPERDRIVE binding: a deployed Worker would have no session store.',
    );
  }

  // A deployment with no database at all keeps the closed failure.
  const unconfigured = createIdentityService(
    { APP_ENV: 'production' },
    'production',
  );

  if (unconfigured !== null) {
    throw new Error(
      'createIdentityService must keep returning null when nothing is configured.',
    );
  }
}

/**
 * AC3 (boundary): with the binding configured, an unresolvable request is
 * a client-visible 401 — the deployment can verify a session and just did
 * not receive one. Without the binding it stays the fail-closed
 * DEPENDENCY_FAILED.
 */
async function testBoundary401WhenTheDeploymentCanVerify(): Promise<void> {
  await expectAppError(
    'no credential with HYPERDRIVE configured is 401 UNAUTHENTICATED',
    () => requireActor(PRODUCTION_SHAPED, undefined, 'production'),
    'UNAUTHENTICATED',
    'A valid session is required.',
  );

  await expectAppError(
    'the synchronous boundary agrees',
    () => requireActorSync(PRODUCTION_SHAPED, undefined, 'production'),
    'UNAUTHENTICATED',
    'A valid session is required.',
  );

  await expectAppError(
    'a deployment with no database still fails closed',
    () => requireActor({ APP_ENV: 'production' }, undefined, 'production'),
    'DEPENDENCY_FAILED',
    'Session verification is not configured.',
  );

  await expectAppError(
    'the development/test contract with nothing configured still fails closed',
    () => requireActor({ APP_ENV: 'test' }, undefined, 'test'),
    'DEPENDENCY_FAILED',
    'Session verification is not configured.',
  );
}

/**
 * AC3 (HTTP): the same decision on a route every business module
 * protects with `requireActor`.
 */
async function testHttp401WhenTheDeploymentCanVerify(): Promise<void> {
  const configured = await app.request(
    PROTECTED_PATH,
    { method: 'GET' },
    PRODUCTION_SHAPED,
  );

  if (configured.status !== 401) {
    throw new Error(
      `Expected 401 for an anonymous request in an HYPERDRIVE-configured deployment, got ${configured.status}.`,
    );
  }

  const configuredBody = (await configured.json()) as {
    error?: { code?: string; details?: unknown };
  };

  if (configuredBody.error?.code !== 'UNAUTHENTICATED') {
    throw new Error(
      `Expected UNAUTHENTICATED, got ${JSON.stringify(configuredBody)}.`,
    );
  }

  if (configuredBody.error?.details !== undefined) {
    throw new Error(
      'A generic authentication failure must carry no details.',
    );
  }

  const unconfigured = await app.request(
    PROTECTED_PATH,
    { method: 'GET' },
    { APP_ENV: 'production' },
  );

  if (unconfigured.status !== 503) {
    throw new Error(
      `Expected 503 when session verification is unconfigured, got ${unconfigured.status}.`,
    );
  }
}

/**
 * Regression guard: the development seam keeps exactly the meaning it has
 * today, binding configured or not. It resolves before the refusal, so a
 * development request with no credential still becomes the dev owner.
 */
async function testDevelopmentSeamIsUnchanged(): Promise<void> {
  const actor = await requireActor(
    {
      APP_ENV: 'development',
      LOCAL_IN_MEMORY_AUTH_ENABLED: 'true',
      DEV_OWNER_ID: 'dev-artisan',
      HYPERDRIVE: PRODUCTION_SHAPED.HYPERDRIVE,
    },
    undefined,
    'development',
  );

  if (actor.actorId !== 'dev-artisan' || actor.authenticated !== true) {
    throw new Error(
      `Expected the development seam to resolve dev-artisan, received ${JSON.stringify(actor)}.`,
    );
  }
}

/**
 * AC1: a durable store reached through the same
 * `resolvePostgresConnectionString` the PostgreSQL repositories use, with
 * the injected `DB_POOL` seam kept untouched.
 */

async function testConnectionResolution(): Promise<void> {
  const injected = { seam: 'injected' } as unknown as PgPool;
  const seamEnv = { APP_ENV: 'production', DB_POOL: injected };

  if (resolveIdentityConnection(seamEnv) !== injected) {
    throw new Error(
      'resolveIdentityConnection must return the injected DB_POOL unchanged.',
    );
  }

  const bindingEnv = {
    APP_ENV: 'production',
    HYPERDRIVE: {
      connectionString:
        'postgresql://wiring-unit-test@127.0.0.1:55432/artisan_marketplace_pool',
    },
  };

  const first = resolveIdentityConnection(bindingEnv);
  const second = resolveIdentityConnection(bindingEnv);

  // No connection is cached across requests: a Worker isolate must not
  // hold a PostgreSQL client idle between requests, because a reused idle
  // socket never settles and the runtime cancels the request.
  if (first === second) {
    throw new Error(
      'resolveIdentityConnection must not reuse one connection across requests.',
    );
  }

  if (typeof first?.query !== 'function' || typeof first?.connect !== 'function') {
    throw new Error(
      'resolveIdentityConnection must build a usable connection from the Hyperdrive binding.',
    );
  }

  // The string form of the same binding value is the same mechanism.
  const stringEnv = {
    APP_ENV: 'production',
    HYPERDRIVE: bindingEnv.HYPERDRIVE.connectionString,
  };

  if (resolveIdentityConnection(stringEnv) === null) {
    throw new Error(
      'The string and binding-object forms of one connection string must both resolve.',
    );
  }

  // A different connection string still resolves to its own connection.
  const other = resolveIdentityConnection({
    APP_ENV: 'production',
    HYPERDRIVE: {
      connectionString:
        'postgresql://wiring-unit-test@127.0.0.1:55432/artisan_marketplace_other',
    },
  });

  if (other === null) {
    throw new Error(
      'A different connection string must resolve to its own connection.',
    );
  }

  // Absent or unusable bindings resolve to no connection, so the caller's
  // fail-closed guard stays in charge.
  for (const env of [
    { APP_ENV: 'production' },
    { APP_ENV: 'production', HYPERDRIVE: '' },
    { APP_ENV: 'production', HYPERDRIVE: 'not-a-postgres-uri' },
    { APP_ENV: 'production', HYPERDRIVE: { connectionString: '   ' } },
  ]) {
    if (resolveIdentityConnection(env) !== null) {
      throw new Error(
        `resolveIdentityConnection must resolve ${describeEnv(env)} to null.`,
      );
    }

    if (hasSessionStoreConfigured(env)) {
      throw new Error(
        `hasSessionStoreConfigured must be false for ${describeEnv(env)}.`,
      );
    }
  }

  if (!hasSessionStoreConfigured(seamEnv)) {
    throw new Error('A configured DB_POOL seam counts as configured.');
  }

  if (!hasSessionStoreConfigured(bindingEnv)) {
    throw new Error('A usable Hyperdrive binding counts as configured.');
  }

  if (createPostgresSessionStore(null) !== null) {
    throw new Error(
      'createPostgresSessionStore must keep returning null for no pool.',
    );
  }
}

/**
 * Process-local session storage is allowed only under the shared policy.
 * The same explicit build-mode seam used by the policy is passed here, so
 * these assertions never depend on the host `NODE_ENV`.
 */
async function testInMemorySessionStoreRequiresSharedPolicy(): Promise<void> {
  const localDevelopment = {
    APP_ENV: 'development',
    LOCAL_IN_MEMORY_AUTH_ENABLED: 'true',
  } as const;
  const localTest = {
    APP_ENV: 'test',
    LOCAL_IN_MEMORY_AUTH_ENABLED: 'true',
  } as const;

  if (!allowsInMemorySessionStore(localDevelopment, 'development')) {
    throw new Error(
      'A matching development environment and build mode with opt-in must allow the in-memory store.',
    );
  }

  if (!allowsInMemorySessionStore(localTest, 'test')) {
    throw new Error(
      'A matching test environment and build mode with opt-in must allow the in-memory store.',
    );
  }

  for (const { label, env, buildMode } of [
    {
      label: 'development without opt-in',
      env: { APP_ENV: 'development' },
      buildMode: 'development',
    },
    {
      label: 'test without opt-in',
      env: { APP_ENV: 'test' },
      buildMode: 'test',
    },
    {
      label: 'missing APP_ENV',
      env: { LOCAL_IN_MEMORY_AUTH_ENABLED: 'true' },
      buildMode: 'test',
    },
    {
      label: 'unknown APP_ENV',
      env: {
        APP_ENV: 'staging',
        LOCAL_IN_MEMORY_AUTH_ENABLED: 'true',
      },
      buildMode: 'development',
    },
    {
      label: 'mismatched build mode',
      env: localDevelopment,
      buildMode: 'test',
    },
    {
      label: 'unknown build mode',
      env: localDevelopment,
      buildMode: 'staging',
    },
    {
      label: 'production build with misleading local configuration',
      env: localDevelopment,
      buildMode: 'production',
    },
  ]) {
    if (allowsInMemorySessionStore(env, buildMode)) {
      throw new Error(
        `${label} must not allow process-local session storage.`,
      );
    }
  }

  const firstLocal = createIdentityService(localDevelopment, 'development');
  const secondLocal = createIdentityService(localDevelopment, 'development');

  if (firstLocal === null || firstLocal !== secondLocal) {
    throw new Error(
      'A policy-approved local configuration must select the in-memory identity service singleton.',
    );
  }

  const misleadingProduction = {
    APP_ENV: 'development',
    LOCAL_IN_MEMORY_AUTH_ENABLED: 'true',
    HYPERDRIVE: PRODUCTION_SHAPED.HYPERDRIVE,
  } as const;

  if (allowsInMemorySessionStore(misleadingProduction, 'production')) {
    throw new Error(
      'A production build must reject misleading local configuration.',
    );
  }

  const durableFirst = createIdentityService(
    misleadingProduction,
    'production',
  );
  const durableSecond = createIdentityService(
    misleadingProduction,
    'production',
  );

  if (durableFirst === null) {
    throw new Error(
      'A production build with HYPERDRIVE must select the PostgreSQL-backed identity service.',
    );
  }

  if (durableFirst === durableSecond) {
    throw new Error(
      'A production build must not select the process-local identity singleton.',
    );
  }

  if (
    createIdentityService(
      { APP_ENV: 'production' },
      'production',
    ) !== null
  ) {
    throw new Error(
      'Missing production persistence configuration must remain fail-closed.',
    );
  }
}

/**
 * A configured store that cannot answer is a dependency failure, not an
 * authentication failure and not an unexpected 500: the deployment can
 * verify a session, it just cannot reach the database right now. The same
 * rule applies to `POST /v1/auth/login`, where a database outage must not
 * be reported to the user as "invalid username or password" (M8 task
 * contract P16: persistence failure = 503 DEPENDENCY_FAILED).
 */
async function testStoreOutageFailsClosedAsDependencyFailure(): Promise<void> {
  await expectAppError(
    'an unreachable session store at the boundary is DEPENDENCY_FAILED',
    () =>
      requireActor(
        STORE_DOWN,
        bearer('not-a-real-credential'),
        'production',
      ),
    'DEPENDENCY_FAILED',
    'Session verification is temporarily unavailable.',
  );

  // The synchronous boundary cannot consult durable storage at all, so it
  // refuses explicitly instead of reporting a verification it never
  // performed. A valid credential cannot be verified here either — the
  // refusal is not about this particular credential.
  await expectAppError(
    'the synchronous boundary refuses durable storage explicitly',
    () =>
      requireActorSync(
        STORE_DOWN,
        bearer('not-a-real-credential'),
        'production',
      ),
    'DEPENDENCY_FAILED',
    'Synchronous session verification is not available for durable session storage.',
  );

  const response = await app.request(
    '/v1/auth/login',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: 'wiringdown',
        password: 'wiring-outage-marker',
      }),
    },
    STORE_DOWN,
  );

  if (response.status !== 503) {
    throw new Error(
      `A database outage during login must be 503 DEPENDENCY_FAILED, not ${response.status}.`,
    );
  }

  const body = (await response.json()) as {
    error?: { code?: string; message?: string };
  };

  if (body.error?.code !== 'DEPENDENCY_FAILED') {
    throw new Error(
      `Expected DEPENDENCY_FAILED for a login outage, got ${JSON.stringify(body)}.`,
    );
  }

  if (body.error?.message === 'Invalid username or password.') {
    throw new Error(
      'A persistence failure must not be reported as an invalid credential.',
    );
  }
}

/**
 * Route-layer guard for the login mapping: a *rejected credential* on
 * `POST /v1/auth/login` must stay the uniform 401 through the route's
 * catch — the persistence-failure branch added for outages must not
 * swallow it. The outage direction is asserted above; this is the other
 * side of the same branch.
 */
async function testLoginCredentialFailureStays401AtTheRoute(): Promise<void> {
  const response = await app.request(
    '/v1/auth/login',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: 'wiringprobe',
        password: 'not-the-right-password',
      }),
    },
    {
      APP_ENV: 'test',
      LOCAL_IN_MEMORY_AUTH_ENABLED: 'true',
    },
  );

  if (response.status !== 401) {
    throw new Error(
      `A rejected credential on login must be 401, received ${response.status}.`,
    );
  }

  const body = (await response.json()) as {
    error?: { code?: string; message?: string; details?: unknown };
  };

  if (body.error?.code !== 'UNAUTHENTICATED') {
    throw new Error(
      `Expected UNAUTHENTICATED for a rejected credential, got ${JSON.stringify(body)}.`,
    );
  }

  if (body.error?.message !== 'Invalid username or password.') {
    throw new Error(
      'A rejected credential must keep the documented uniform message.',
    );
  }

  if (body.error?.details !== undefined) {
    throw new Error(
      'A rejected credential must carry no details.',
    );
  }
}

async function main(): Promise<void> {
  await testProductionShapeObtainsASessionStore();
  await testConnectionResolution();
  await testInMemorySessionStoreRequiresSharedPolicy();
  await testBoundary401WhenTheDeploymentCanVerify();
  await testHttp401WhenTheDeploymentCanVerify();
  await testDevelopmentSeamIsUnchanged();
  await testStoreOutageFailsClosedAsDependencyFailure();
  await testLoginCredentialFailureStays401AtTheRoute();

  console.log('IDENTITY COMPOSITION (HYPERDRIVE WIRING) TESTS PASSED');
}

void main().catch((error) => {
  console.error('IDENTITY COMPOSITION (HYPERDRIVE WIRING) TESTS FAILED');
  console.error(error);
  process.exitCode = 1;
});
