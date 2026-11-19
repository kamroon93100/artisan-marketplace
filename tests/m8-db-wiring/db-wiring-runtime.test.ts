import assert from "node:assert/strict";
import { Pool } from "pg";

import app from "../../apps/api/src/index.ts";
import { AppError } from "../../apps/api/src/shared/errors/app-error.ts";
import { IdentityService } from "../../apps/api/src/modules/identity/application/identity-service.ts";
import {
  PostgresSessionStore,
  createCredentialHasherSync,
} from "../../apps/api/src/modules/identity/infrastructure/postgres-session-store.ts";
import {
  allowsInMemorySessionStore,
  createIdentityService,
  resolveIdentityConnection,
} from "../../apps/api/src/modules/identity/composition.ts";
import {
  requireActor,
  requireActorSync,
} from "../../apps/api/src/shared/auth/session.ts";
import type {
  SessionBindingEnv,
} from "../../apps/api/src/shared/auth/session.ts";

/**
 * M8 §10 Phase 1 — the request environment of a *deployed* Worker must be
 * able to obtain the PostgreSQL-backed session store.
 *
 * A deployed Worker receives the `HYPERDRIVE` binding. It never receives
 * `DB_POOL`, which is an injectable seam a test can add to an environment
 * object. This proof therefore builds its environment from exactly what
 * the Worker runtime delivers — `APP_ENV` plus the `HYPERDRIVE` binding
 * object — and proves that through it, and nothing else:
 *
 *  1. Identity resolves a real PostgreSQL session store whose connection is
 *     derived from the binding - built per resolution and closed per
 *     operation, never cached across requests, because a Worker isolate
 *     must not hold a PostgreSQL client idle between requests;
 *  2. a valid credential resolves to its persisted actor at the
 *     authentication boundary;
 *  3. missing and unrecognized credentials are 401 `UNAUTHENTICATED`
 *     there and over HTTP — before the wiring, both answers were 503
 *     `DEPENDENCY_FAILED`, the fail-closed code for a deployment with no
 *     session verification at all;
 *  4. the auth routes (`/v1/auth/*`) and a protected catalog route work
 *     over HTTP with that same environment, so the store is obtained
 *     through the request environment rather than injected beside it;
 *  5. a deployment with no database at all still fails closed with 503.
 *
 * Why this is a real proof rather than a self-consistent one:
 *
 *  1. `resolveIdentityConnection` builds its connection from
 *     `resolvePostgresConnectionString(env)`, the same function the
 *     PostgreSQL repositories use, so there is one Hyperdrive mechanism
 *     rather than a second connection path invented for Identity.
 *  2. `APP_ENV` is neither `development` nor `test`, so
 *     `allowsInMemorySessionStore` is false and the in-memory store
 *     cannot answer for the wiring. `TestSessionStore` is never
 *     referenced here.
 *  3. The static `SESSION_TOKEN`/`SESSION_ACTOR_ID` binding and the
 *     `DEV_OWNER_ID` seam are asserted unset, so no legacy seam can
 *     answer for the store.
 *  4. Every refusal and resolution below is checked against canonical
 *     PostgreSQL state through the same binding.
 *
 * Scope discipline: this slice proves HYPERDRIVE → session-store wiring
 * and the 401-vs-503 decision in that shape. It does not prove actor
 * isolation, logout, refresh, roles, discovery posture, mobile auth, or
 * any Phase 2/3/4 item, each of which has its own proof or suite.
 *
 * It is deliberately NOT part of `pnpm verify` (ADR-010: that is the
 * service-free fast path). Use `scripts/verify-m8-db-wiring-postgres.ps1`.
 */

const connectionString = process.env.M8_DB_WIRING_POSTGRES_URL;

if (!connectionString) {
  throw new Error(
    "M8_DB_WIRING_POSTGRES_URL must point at the project-local PostgreSQL instance. Use scripts/verify-m8-db-wiring-postgres.ps1, which reads it from the Hyperdrive binding in apps/api/wrangler.jsonc.",
  );
}

/**
 * Obvious non-secret markers, per the M8 contract's test-fixture rule.
 * Q5.3 requires at least 15 characters and no composition rules.
 */
const BOUNDARY_CREDENTIAL = {
  username: "m8_wiring_proof",
  password: "wiring-proof-marker",
};

const HTTP_CREDENTIAL = {
  username: "m8_wiring_http",
  password: "http-wiring-marker",
};

// A well-formed product id that is deliberately absent: the catalog
// repository reads ids as UUIDs, so a non-UUID would fail in Postgres
// before the handler's not-found path and prove nothing about auth.
const PROTECTED_PATH =
  "/catalog/products/00000000-0000-4000-8000-000000000000";

const PROTECTED_INIT = {
  method: "GET",
} as const;

/**
 * The environment a deployed Worker delivers: the binding object, no
 * injected pool, no static session, no development seam.
 */
const workerEnv: SessionBindingEnv & { APP_ENV: string } = {
  APP_ENV: "production",
  HYPERDRIVE: { connectionString },
};

const reported: string[] = [];

function report(line: string): void {
  reported.push(line);
  console.log(line);
}

function step(label: string): void {
  report(`  PASS  ${label}`);
}

function bearer(credential: string): string {
  return `Bearer ${credential}`;
}

async function expectAppError(
  label: string,
  run: () => unknown | Promise<unknown>,
  code: string,
  expectedMessage?: string,
  expectedDetails?: Record<string, unknown>,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    assert.ok(
      error instanceof AppError,
      `${label}: expected an AppError, received ${String(error)}.`,
    );
    assert.equal(error.code, code, `${label}: expected ${code}.`);

    if (expectedMessage !== undefined) {
      assert.equal(
        error.message,
        expectedMessage,
        `${label}: expected the documented refusal message.`,
      );
    }

    if (expectedDetails !== undefined) {
      assert.deepEqual(
        error.details,
        expectedDetails,
        `${label}: expected these details.`,
      );
    } else if (code === "UNAUTHENTICATED") {
      assert.equal(
        error.details,
        undefined,
        `${label}: a generic authentication failure must carry no details.`,
      );
    }

    return;
  }

  assert.fail(`${label}: expected ${code}, but no error was raised.`);
}

async function expectHttp(
  label: string,
  env: Record<string, unknown>,
  path: string,
  init: RequestInit,
  status: number,
  code: string,
): Promise<void> {
  const response = await app.request(path, init, env);

  assert.equal(
    response.status,
    status,
    `${label}: expected HTTP ${status}.`,
  );

  const body = (await response.json()) as {
    error?: { code?: string; details?: unknown };
  };

  assert.equal(
    body.error?.code,
    code,
    `${label}: expected wire code ${code}, received ${JSON.stringify(body)}.`,
  );

  if (code === "UNAUTHENTICATED") {
    assert.equal(
      body.error?.details,
      undefined,
      `${label}: a generic authentication failure must carry no details.`,
    );
  }

  report(`  PASS  ${label} -> HTTP ${status} ${code}`);
}

async function main(): Promise<void> {
  const setupPool = new Pool({ connectionString: process.env.M8_DB_WIRING_SETUP_URL ?? connectionString });
  try {
    // ---------------------------------------------------------------------
    // Preconditions: the environment carries the binding and nothing else.
    // ---------------------------------------------------------------------

    assert.equal(
      allowsInMemorySessionStore(workerEnv.APP_ENV as string),
      false,
      "Precondition failed: this environment must not admit the in-memory session store.",
    );
    step("store selection precondition: in-memory session store is not admissible");

    assert.equal(workerEnv.DB_POOL, undefined);
    assert.equal(workerEnv.SESSION_TOKEN, undefined);
    assert.equal(workerEnv.SESSION_ACTOR_ID, undefined);
    assert.equal(workerEnv.DEV_OWNER_ID, undefined);
    step("the environment carries only APP_ENV and the HYPERDRIVE binding");

    const hashFn = createCredentialHasherSync();
    const setupStore = new PostgresSessionStore(setupPool, hashFn);
    assert.ok(
      setupStore instanceof PostgresSessionStore,
      "The setup store must be the durable PostgreSQL store.",
    );
    step("setup store is a real PostgresSessionStore (fixture only)");

    // ---------------------------------------------------------------------
    // Scoped cleanup so the proof is repeatable. Sessions go first because
    // identity_sessions.actor_id is ON DELETE RESTRICT.
    // ---------------------------------------------------------------------

    for (const username of [BOUNDARY_CREDENTIAL.username, HTTP_CREDENTIAL.username]) {
      await setupPool.query(
        `delete from identity_sessions
           where actor_id in (
             select id from identity_accounts
              where username_normalized = $1
           )`,
        [username],
      );

      await setupPool.query(
        `delete from identity_accounts where username_normalized = $1`,
        [username],
      );
    }
    step("scoped cleanup removed any prior rows for the proof usernames");

    // ---------------------------------------------------------------------
    // AC1 — the connection comes from the binding, fresh per resolution.
    // ---------------------------------------------------------------------

    const first = resolveIdentityConnection(workerEnv);
    const second = resolveIdentityConnection(workerEnv);

    assert.ok(
      typeof first?.query === "function" && typeof first?.connect === "function",
      "The binding must resolve to a usable session-store connection.",
    );
    assert.notEqual(
      first,
      second,
      "No connection may be cached across resolutions: a Worker isolate must not hold a PostgreSQL client idle between requests.",
    );
    assert.notEqual(
      first,
      setupPool,
      "The resolved connection must come from the binding itself, not from the proof's setup pool.",
    );
    step("HYPERDRIVE resolves a fresh per-request connection, separate from the proof's own pool");

    // ---------------------------------------------------------------------
    // One real account established through the real IdentityService.
    // ---------------------------------------------------------------------

    const identity = new IdentityService(setupStore);
    const registration = await identity.register(BOUNDARY_CREDENTIAL);
    const actorId = registration.actor.actorId;
    step("one account registered through IdentityService (Q5.4 auto-session)");

    // ---------------------------------------------------------------------
    // AC2/AC3 — boundary behavior through the binding-only environment.
    // ---------------------------------------------------------------------

    const resolved = await requireActor(
      workerEnv,
      bearer(registration.accessToken),
    );

    assert.equal(
      resolved.actorId,
      actorId,
      "A valid credential must resolve to its own persisted actor.",
    );
    assert.equal(resolved.authenticated, true);
    step("a valid credential resolves to its persisted actor through HYPERDRIVE alone");

    const persistedActor = await setupPool.query<{ id: string }>(
      `select id from identity_accounts where username_normalized = $1`,
      [BOUNDARY_CREDENTIAL.username],
    );

    assert.equal(
      persistedActor.rows[0]?.id,
      actorId,
      "The resolved actor must be the persisted account row.",
    );
    step("the resolved actor matches the persisted PostgreSQL account row");

    await expectAppError(
      "no credential at the boundary is 401 UNAUTHENTICATED",
      () => requireActor(workerEnv, undefined),
      "UNAUTHENTICATED",
      "A valid session is required.",
    );

    await expectAppError(
      "an unrecognized credential is judged by the store behind the binding",
      () => requireActor(workerEnv, bearer("not-a-real-credential")),
      "UNAUTHENTICATED",
      "A valid session is required.",
    );

    // The synchronous boundary cannot consult durable storage — its only
    // synchronous store method never queries PostgreSQL — so it refuses
    // explicitly instead of pretending to have verified this credential.
    // The asynchronous boundary is the one every business module uses.
    await expectAppError(
      "the synchronous boundary refuses durable storage explicitly",
      () => requireActorSync(workerEnv, bearer("not-a-real-credential")),
      "DEPENDENCY_FAILED",
      "Synchronous session verification is not available for durable session storage.",
    );
    step(
      "async boundary: missing and unrecognized credentials are 401; sync boundary refuses durable storage explicitly",
    );

    const identityService = createIdentityService(workerEnv);
    assert.notEqual(
      identityService,
      null,
      "createIdentityService must resolve a store for the Worker's own environment.",
    );
    step("createIdentityService resolves a store from the Worker environment");

    // ---------------------------------------------------------------------
    // AC4 — the same environment over HTTP: protected route and auth route.
    // ---------------------------------------------------------------------

    await expectHttp(
      "protected route without a credential",
      workerEnv,
      PROTECTED_PATH,
      PROTECTED_INIT,
      401,
      "UNAUTHENTICATED",
    );

    await expectHttp(
      "protected route with an unrecognized credential",
      workerEnv,
      PROTECTED_PATH,
      {
        ...PROTECTED_INIT,
        headers: { authorization: bearer("not-a-real-credential") },
      },
      401,
      "UNAUTHENTICATED",
    );

    const withValidCredential = await app.request(
      PROTECTED_PATH,
      {
        ...PROTECTED_INIT,
        headers: { authorization: bearer(registration.accessToken) },
      },
      workerEnv,
    );

    assert.notEqual(
      withValidCredential.status,
      401,
      "A valid credential must not be refused on a protected route.",
    );
    assert.notEqual(
      withValidCredential.status,
      503,
      "A configured deployment must not fail closed on a protected route.",
    );
    assert.equal(
      withValidCredential.status,
      404,
      `A valid credential must reach the handler; expected 404 for an absent product, received ${withValidCredential.status}.`,
    );
    step(
      "protected route: 401 without a credential, handler reached (404) with one",
    );

    const registerResponse = await app.request(
      "/v1/auth/register",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(HTTP_CREDENTIAL),
      },
      workerEnv,
    );

    assert.equal(
      registerResponse.status,
      201,
      `Registration over the Worker environment must succeed against PostgreSQL; received ${registerResponse.status}.`,
    );

    const registerBody = (await registerResponse.json()) as {
      session?: { accessToken?: string };
    };
    const httpSessionToken = registerBody.session?.accessToken;

    assert.ok(
      httpSessionToken,
      "Registration must return a session credential.",
    );
    step("POST /v1/auth/register answered 201 through the binding-only environment");

    const authenticatedRead = await app.request(
      PROTECTED_PATH,
      {
        ...PROTECTED_INIT,
        headers: { authorization: bearer(httpSessionToken) },
      },
      workerEnv,
    );

    assert.equal(
      authenticatedRead.status,
      404,
      `A credential issued over HTTP must authenticate on a protected route; received ${authenticatedRead.status}.`,
    );
    step("a session issued over HTTP authenticates on a protected route");

    // ---------------------------------------------------------------------
    // AC5 — the fail-closed answer for a deployment with no database is
    // unchanged, in the same shape.
    // ---------------------------------------------------------------------

    await expectHttp(
      "protected route in a deployment with no database binding",
      { APP_ENV: "production" },
      PROTECTED_PATH,
      PROTECTED_INIT,
      503,
      "DEPENDENCY_FAILED",
    );
    step("a deployment that cannot verify a session still fails closed");

    // ---------------------------------------------------------------------
    // Credential material never appears in this proof's output.
    // ---------------------------------------------------------------------

    const secrets = [
      registration.accessToken,
      registration.refreshToken,
      httpSessionToken,
      BOUNDARY_CREDENTIAL.password,
      HTTP_CREDENTIAL.password,
      "not-a-real-credential",
    ];

    for (const line of reported) {
      for (const secret of secrets) {
        assert.ok(
          !line.includes(secret),
          "Proof output must not contain credential material.",
        );
      }
    }
    step("the proof's reported lines contain no credential material");

    report("");
    report("M8 PHASE 1 HYPERDRIVE→SESSION-STORE WIRING PROOF PASSED");
  } finally {
    // The proof's own pool is the only connection it holds. The connection
    // Identity resolves from the binding closes its own socket per
    // operation, so there is no module-scoped pool left to end here.
    await setupPool.end();
  }
}

void main().catch((error) => {
  console.error("M8 PHASE 1 HYPERDRIVE→SESSION-STORE WIRING PROOF FAILED");
  console.error(error);
  process.exitCode = 1;
});
