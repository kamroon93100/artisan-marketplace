import assert from "node:assert/strict";
import { Pool } from "pg";

import app from "../../apps/api/src/index.ts";
import { AppError } from "../../apps/api/src/shared/errors/app-error.ts";
import { IdentityService } from "../../apps/api/src/modules/identity/application/identity-service.ts";
import {
  PostgresSessionStore,
  createCredentialHasherSync,
} from "../../apps/api/src/modules/identity/infrastructure/postgres-session-store.ts";
import { allowsInMemorySessionStore } from "../../apps/api/src/modules/identity/composition.ts";
import { ACCESS_TOKEN_LIFETIME_MS } from "../../apps/api/src/modules/identity/domain/session.ts";
import {
  requireActor,
  requireActorSync,
} from "../../apps/api/src/shared/auth/session.ts";

/**
 * M8 §10 Phase 1 — "Unauthenticated requests to protected routes receive
 * 401 (`UNAUTHENTICATED`); a deployment that cannot verify a session still
 * fails closed (`DEPENDENCY_FAILED`) outside development/test."
 *
 * This proves exactly that one acceptance item, in both halves:
 *
 *  1. A deployment that *can* verify a session answers a request it could
 *     not resolve with 401 `UNAUTHENTICATED` — both at the boundary
 *     (`requireActor`) and over HTTP on a protected route. This is the
 *     observed defect: with a PostgreSQL store and no static seam, an
 *     unrecognized credential used to fall through every seam and land on
 *     `DEPENDENCY_FAILED` ("Session verification is not configured"), a
 *     503 that tells a client the server is broken when in fact the
 *     server just refused the credential.
 *
 *  2. A deployment with *no* way to verify a session still fails closed
 *     with `DEPENDENCY_FAILED` (HTTP 503). That code is a deployment
 *     fault, not a client one, and it must not be softened into 401.
 *
 * Why this is a real proof rather than a self-consistent one:
 *
 *  1. `requireActor` builds its own `IdentityService` and its own
 *     `PostgresSessionStore` from the environment on every call, so a
 *     refusal can only come from canonical database state.
 *  2. `APP_ENV` is neither `development` nor `test`, so
 *     `allowsInMemorySessionStore` is false and the in-memory store
 *     cannot be selected. `TestSessionStore` is never referenced here.
 *  3. The static `SESSION_TOKEN`/`SESSION_ACTOR_ID` binding and the
 *     `DEV_OWNER_ID` seam are deliberately unset for the main cases and
 *     asserted unset, so no legacy seam can answer for the store.
 *
 * Scope discipline: this slice proves 401 vs `DEPENDENCY_FAILED` and that
 * the two deliberate refusal states (expired/revoked) plus both legacy
 * seams keep their existing meaning. It does not prove actor isolation,
 * logout, refresh, discovery posture, mobile auth, or Phase 2/3/4 items.
 *
 * It is deliberately NOT part of `pnpm verify` (ADR-010: that is the
 * service-free fast path). Use
 * `scripts/verify-m8-unauthenticated-401-postgres.ps1`.
 */

const connectionString = process.env.M8_POSTGRES_URL;

if (!connectionString) {
  throw new Error(
    "M8_POSTGRES_URL must point at the project-local PostgreSQL instance. Use scripts/verify-m8-unauthenticated-401-postgres.ps1, which reads it from the Hyperdrive binding in apps/api/wrangler.jsonc.",
  );
}

/**
 * Obvious non-secret markers, per the M8 contract's test-fixture rule.
 * Q5.3 requires at least 15 characters and no composition rules.
 */
const PROOF_CREDENTIAL = {
  username: "m8_401_proof",
  password: "unauthenticated-proof-marker",
};

const PROTECTED_PATH = "/catalog/products";

type ProtectedInit = {
  method: string;
  headers: Record<string, string>;
  body?: string;
};

const PROTECTED_INIT: ProtectedInit = {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "idempotency-key": "m8-401-proof",
  },
  body: JSON.stringify({ title: "Proof Basket" }),
};

/**
 * Every line this proof prints is collected here so the credential-leak
 * check at the end can assert over the proof's own output rather than
 * trusting that no interpolation slipped through.
 */
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

/**
 * Asserts the refusal is an `AppError` with the expected code, and — when
 * given — the expected message and `details`.
 *
 * Omitting `expectedDetails` for an `UNAUTHENTICATED` refusal means the
 * error must carry no `details` at all: a missing/unknown/invalid
 * credential is `UNAUTHENTICATED` with no `details.reason`. Only the two
 * deliberate refusal states pass details, whose vocabulary is exactly
 * `SESSION_EXPIRED` / `SESSION_REVOKED`.
 */
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
    assert.equal(
      error.code,
      code,
      `${label}: expected ${code}.`,
    );

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

/**
 * Asserts an HTTP refusal on the protected route: status, wire code, and
 * that the body carries no session `details.reason` for a generic
 * failure.
 */
async function expectHttpRefusal(
  label: string,
  env: Record<string, unknown>,
  status: number,
  code: string,
  init: ProtectedInit = PROTECTED_INIT,
): Promise<void> {
  const response = await app.request(PROTECTED_PATH, init, env);

  assert.equal(
    response.status,
    status,
    `${label}: expected HTTP ${status}.`,
  );

  const body = (await response.json()) as {
    error?: { code?: string; message?: string; details?: unknown };
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
  const pool = new Pool({ connectionString });

  try {
    // ---------------------------------------------------------------------
    // Preconditions on the store selection and the absence of legacy seams.
    // ---------------------------------------------------------------------

    const env: {
      APP_ENV: string;
      DB_POOL: Pool;
      SESSION_ACTOR_ID?: string;
      SESSION_TOKEN?: string;
      DEV_OWNER_ID?: string;
    } = { APP_ENV: "production", DB_POOL: pool };

    assert.equal(
      allowsInMemorySessionStore(env.APP_ENV),
      false,
      "Precondition failed: this environment must not admit the in-memory session store.",
    );
    step("store selection precondition: in-memory session store is not admissible");

    assert.equal(env.SESSION_TOKEN, undefined);
    assert.equal(env.SESSION_ACTOR_ID, undefined);
    assert.equal(env.DEV_OWNER_ID, undefined);
    step("no static SESSION_TOKEN/SESSION_ACTOR_ID or DEV_OWNER_ID seam is configured");

    const hashFn = createCredentialHasherSync();
    const sessionStore = new PostgresSessionStore(pool, hashFn);
    assert.ok(
      sessionStore instanceof PostgresSessionStore,
      "The registering session store must be the durable PostgreSQL store.",
    );
    step("registering session store is a real PostgresSessionStore");

    // ---------------------------------------------------------------------
    // Scoped cleanup so the proof is repeatable. Only this proof's
    // username is removed; sessions go first because
    // identity_sessions.actor_id is ON DELETE RESTRICT.
    // ---------------------------------------------------------------------

    await pool.query(
      `delete from identity_sessions
         where actor_id in (
           select id from identity_accounts
            where username_normalized = $1
         )`,
      [PROOF_CREDENTIAL.username],
    );

    await pool.query(
      `delete from identity_accounts where username_normalized = $1`,
      [PROOF_CREDENTIAL.username],
    );
    step("scoped cleanup removed any prior rows for the proof username");

    // ---------------------------------------------------------------------
    // One real account, established through the real IdentityService, so
    // every credential below comes from canonical PostgreSQL state.
    // ---------------------------------------------------------------------

    const identity = new IdentityService(sessionStore);
    const registration = await identity.register(PROOF_CREDENTIAL);
    const actorId = registration.actor.actorId;

    step("one account registered through IdentityService (Q5.4 auto-session)");

    // ---------------------------------------------------------------------
    // Half 1 — a deployment that CAN verify a session answers 401.
    // ---------------------------------------------------------------------

    await expectAppError(
      "no credential at the boundary is 401 UNAUTHENTICATED with no details",
      () => requireActor(env, undefined),
      "UNAUTHENTICATED",
      "A valid session is required.",
    );

    await expectAppError(
      "an unrecognized credential at the boundary is 401 UNAUTHENTICATED with no details",
      () => requireActor(env, bearer("not-a-real-credential")),
      "UNAUTHENTICATED",
      "A valid session is required.",
    );
    step(
      "boundary: missing and unrecognized credentials are 401 UNAUTHENTICATED, not DEPENDENCY_FAILED",
    );

    // The synchronous boundary cannot consult durable storage: its only
    // synchronous store method is a stub that never queries PostgreSQL,
    // so it refuses explicitly rather than claiming a judgment it never
    // made. The async boundary above is the one every business module
    // uses, and that is where 401 is proven.
    await expectAppError(
      "the synchronous boundary refuses durable storage explicitly",
      () => requireActorSync(env, bearer("not-a-real-credential")),
      "DEPENDENCY_FAILED",
      "Synchronous session verification is not available for durable session storage.",
    );
    step("synchronous boundary refuses durable storage with DEPENDENCY_FAILED");

    const resolved = await requireActor(
      env,
      bearer(registration.accessToken),
    );

    assert.equal(
      resolved.actorId,
      actorId,
      "A valid credential must still resolve to its own persisted actor.",
    );
    assert.equal(resolved.authenticated, true);
    step("a valid credential still resolves to its persisted actor (unchanged)");

    const persistedActor = await pool.query<{ id: string }>(
      `select id from identity_accounts where username_normalized = $1`,
      [PROOF_CREDENTIAL.username],
    );

    assert.equal(
      persistedActor.rows[0]?.id,
      actorId,
      "The resolved actor must be the persisted account row.",
    );
    step("the resolved actor matches the persisted PostgreSQL account row");

    // ---------------------------------------------------------------------
    // The same decision over HTTP, on a route every business module
    // protects with `requireActor`.
    // ---------------------------------------------------------------------

    await expectHttpRefusal(
      "protected route without a credential",
      env,
      401,
      "UNAUTHENTICATED",
    );

    await expectHttpRefusal(
      "protected route with an unrecognized credential",
      env,
      401,
      "UNAUTHENTICATED",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "m8-401-proof-unknown",
          authorization: bearer("not-a-real-credential"),
        },
        body: JSON.stringify({ title: "Proof Basket" }),
      },
    );

    // ---------------------------------------------------------------------
    // The two deliberate refusal states stay distinguishable in this
    // shape: they are thrown before the fallback this slice changes.
    // ---------------------------------------------------------------------

    const backdated = new IdentityService(
      sessionStore,
      () => Date.now() - ACCESS_TOKEN_LIFETIME_MS - 60_000,
    );

    const stale = await backdated.establishAsync({
      actorId,
      roles: ["BUYER"],
    });

    await expectAppError(
      "an expired credential stays 401 with reason SESSION_EXPIRED",
      () => requireActor(env, bearer(stale.accessToken)),
      "UNAUTHENTICATED",
      "Session expired.",
      { reason: "SESSION_EXPIRED" },
    );

    const revocable = await identity.establishAsync({
      actorId,
      roles: ["BUYER"],
    });

    const revoked = await identity.revokeSessionAsync(
      revocable.sessionId,
    );
    assert.equal(
      revoked,
      true,
      "The revocation must report a session it actually revoked.",
    );

    await expectAppError(
      "a revoked credential stays 401 with reason SESSION_REVOKED",
      () => requireActor(env, bearer(revocable.accessToken)),
      "UNAUTHENTICATED",
      "Session revoked.",
      { reason: "SESSION_REVOKED" },
    );
    step("expired and revoked remain explicit 401 refusal states");

    // ---------------------------------------------------------------------
    // Half 2 — a deployment that CANNOT verify a session still fails
    // closed with DEPENDENCY_FAILED (HTTP 503).
    // ---------------------------------------------------------------------

    await expectAppError(
      "an unrecognized credential with no session store fails closed",
      () =>
        requireActor(
          { APP_ENV: "production" },
          bearer("not-a-real-credential"),
        ),
      "DEPENDENCY_FAILED",
      "Session verification is not configured.",
    );

    await expectAppError(
      "no credential with no session store fails closed",
      () => requireActor({ APP_ENV: "production" }, undefined),
      "DEPENDENCY_FAILED",
      "Session verification is not configured.",
    );

    await expectHttpRefusal(
      "protected route in a deployment with no session store",
      { APP_ENV: "production" },
      503,
      "DEPENDENCY_FAILED",
    );

    // The development/test contract in identity.test.ts: with nothing
    // configured at all, a request with no credential still fails closed.
    await expectAppError(
      "a request with no credential fails closed when nothing is configured",
      () => requireActor({ APP_ENV: "test" }, undefined),
      "DEPENDENCY_FAILED",
      "Session verification is not configured.",
    );
    step("deployments that cannot verify a session still fail closed");

    // ---------------------------------------------------------------------
    // Both legacy seams keep exactly the meaning they have today.
    // ---------------------------------------------------------------------

    const devSeam = await requireActor(
      { APP_ENV: "development", DEV_OWNER_ID: "dev-artisan" },
      bearer("not-a-real-credential"),
    );

    assert.equal(
      devSeam.actorId,
      "dev-artisan",
      "An unrecognized credential must still fall through to the development seam.",
    );

    await expectAppError(
      "the static session still refuses an unrecognized credential with 401",
      () =>
        requireActor(
          {
            APP_ENV: "production",
            SESSION_TOKEN: "static-token-value",
            SESSION_ACTOR_ID: "static-actor",
          },
          bearer("not-a-real-credential"),
        ),
      "UNAUTHENTICATED",
      "A valid session is required.",
    );

    await expectAppError(
      "the static session still refuses a missing credential with 401",
      () =>
        requireActor(
          {
            APP_ENV: "production",
            SESSION_TOKEN: "static-token-value",
            SESSION_ACTOR_ID: "static-actor",
          },
          undefined,
        ),
      "UNAUTHENTICATED",
      "A valid session is required.",
    );
    step("development seam and static session keep their existing meaning");

    // ---------------------------------------------------------------------
    // Credential material never appears in this proof's output.
    // ---------------------------------------------------------------------

    const secrets = [
      registration.accessToken,
      registration.refreshToken,
      stale.accessToken,
      stale.refreshToken,
      revocable.accessToken,
      revocable.refreshToken,
      PROOF_CREDENTIAL.password,
    ];

    for (const line of reported) {
      for (const secret of secrets) {
        assert.ok(
          !line.includes(secret),
          "Proof output must not contain credential material.",
        );
      }
    }
    step("proof output contains no credential material");

    report("");
    report("M8 PHASE 1 401/DEPENDENCY_FAILED PROOF PASSED");
  } finally {
    await pool.end();
  }
}

void main().catch((error) => {
  console.error("M8 PHASE 1 401/DEPENDENCY_FAILED PROOF FAILED");
  console.error(error);
  process.exitCode = 1;
});
