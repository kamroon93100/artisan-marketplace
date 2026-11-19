import assert, { AssertionError } from "node:assert/strict";
import { Pool } from "pg";

import { IdentityService } from "../../apps/api/src/modules/identity/application/identity-service.ts";
import { PostgresSessionStore, createCredentialHasherSync } from "../../apps/api/src/modules/identity/infrastructure/postgres-session-store.ts";
import { allowsInMemorySessionStore } from "../../apps/api/src/modules/identity/composition.ts";
import { requireActor } from "../../apps/api/src/shared/auth/session.ts";

/**
 * M8 §10 Phase 1, slice 1 — the actor-isolation primitive.
 *
 * This proves exactly one acceptance item: "Two distinct valid credentials
 * resolve to two distinct `actorId`s in a focused test" (Phase 1, first
 * checkbox), plus its four isolation consequences. The M8 contract names
 * this "the isolation primitive" and "the core defect M8 fixes"; the single
 * shared `SESSION_ACTOR_ID` seam must not be able to satisfy it.
 *
 * The path under test is the real authentication boundary, not the store:
 *
 *   requireActor(env, "Bearer <credential>")
 *     -> createIdentityService(env)
 *     -> new IdentityService(postgresSessionStore)
 *     -> IdentityService.verifyAccessTokenAsync(credential)
 *     -> PostgresSessionStore.findByAccessToken(credential)
 *
 * Two properties make this a real proof rather than a self-consistent one:
 *
 *  1. `requireActor` constructs its *own* `IdentityService` and its own
 *     `PostgresSessionStore` per call. The instances used to register the
 *     accounts are different objects. A successful resolution therefore
 *     cannot be answered from anything held in the registering process -
 *     it can only come from canonical database state.
 *
 *  2. `APP_ENV` is deliberately neither `development` nor `test`, so
 *     `allowsInMemorySessionStore` is false and `createIdentityService`
 *     cannot select `InMemorySessionStore`. `TestSessionStore` is never
 *     referenced by this file at all. The assertion is made explicitly
 *     below rather than assumed.
 *
 * Scope discipline: this slice proves *credential -> actor* resolution only.
 * It does not prove 401 handling on protected routes, expired/revoked
 * refusal, logout, refresh, the `SESSION_ACTOR_ID` seam removal, role
 * enforcement on discovery, or anything in Phase 2/3/4. Those remain
 * separate, unchecked Phase 1 items.
 *
 * It is deliberately NOT part of `pnpm verify`, which is the service-free
 * fast path (ADR-010). Use `scripts/verify-m8-actor-isolation-postgres.ps1`.
 */

const connectionString = process.env.M8_POSTGRES_URL;

if (!connectionString) {
  throw new Error(
    "M8_POSTGRES_URL must point at the project-local PostgreSQL instance. Use scripts/verify-m8-actor-isolation-postgres.ps1, which reads it from the Hyperdrive binding in apps/api/wrangler.jsonc.",
  );
}

/**
 * Obvious non-secret markers, per the M8 contract's test-fixture rule.
 * Q5.3 requires at least 15 characters and no composition rules.
 */
const CREDENTIAL_A = {
  username: "isolation_actor_a",
  password: "isolation-proof-marker-alpha",
};
const CREDENTIAL_B = {
  username: "isolation_actor_b",
  password: "isolation-proof-marker-bravo",
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

async function main(): Promise<void> {
  const pool = new Pool({ connectionString });
  const setupPool = new Pool({ connectionString: process.env.M8_POSTGRES_SETUP_URL ?? connectionString });

  try {
    // ---------------------------------------------------------------------
    // Preconditions on the store selection itself.
    // ---------------------------------------------------------------------

    // The three legacy seams are declared but intentionally left unset, so
    // their absence is asserted below rather than merely assumed by the shape
    // of the object literal.
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

    assert.equal(env.APP_ENV, "production");
    assert.equal(env.SESSION_ACTOR_ID, undefined);
    assert.equal(env.SESSION_TOKEN, undefined);
    assert.equal(env.DEV_OWNER_ID, undefined);
    step("no static SESSION_ACTOR_ID, SESSION_TOKEN or DEV_OWNER_ID seam is configured");

    // The store used to *write* the identities is the durable one, and it
    // is asserted to be the durable type so a test double cannot slip in.
    const hashFn = createCredentialHasherSync();
    const sessionStore = new PostgresSessionStore(pool, hashFn);
    assert.ok(
      sessionStore instanceof PostgresSessionStore,
      "The registering session store must be the durable PostgreSQL store.",
    );
    step("registering session store is a real PostgresSessionStore");

    // ---------------------------------------------------------------------
    // Scoped cleanup so the proof is repeatable.
    //
    // Only the two usernames this proof uses are removed. Rows belonging to
    // any other milestone proof are left untouched. Deleting sessions first
    // cascades to identity_refresh_grants; identity_sessions.actor_id is
    // ON DELETE RESTRICT, so accounts cannot be removed before their
    // sessions.
    // ---------------------------------------------------------------------

    await setupPool.query(
      `delete from identity_sessions
         where actor_id in (
           select id from identity_accounts
            where username_normalized = any($1::text[])
         )`,
      [[CREDENTIAL_A.username, CREDENTIAL_B.username]],
    );

    await setupPool.query(
      `delete from identity_accounts where username_normalized = any($1::text[])`,
      [[CREDENTIAL_A.username, CREDENTIAL_B.username]],
    );
    step("scoped cleanup removed any prior rows for the two proof usernames");

    // ---------------------------------------------------------------------
    // Register the two accounts through the real IdentityService.
    // ---------------------------------------------------------------------

    const identity = new IdentityService(sessionStore);

    const registrationA = await identity.register(CREDENTIAL_A);
    const registrationB = await identity.register(CREDENTIAL_B);

    step("two accounts registered through IdentityService (Q5.4 auto-session)");

    const actorIdA = registrationA.actor.actorId;
    const actorIdB = registrationB.actor.actorId;

    // ---------------------------------------------------------------------
    // Persistence: two distinct, separately stored identities.
    // ---------------------------------------------------------------------

    const persisted = await pool.query<{
      username_normalized: string;
      account_id: string;
      session_id: string;
      access_token_hash: string | null;
    }>(
      `select a.username_normalized,
              a.id            as account_id,
              s.session_id    as session_id,
              s.access_token_hash
         from identity_accounts a
         join identity_sessions s on s.actor_id = a.id
        where a.username_normalized = any($1::text[])
        order by a.username_normalized`,
      [[CREDENTIAL_A.username, CREDENTIAL_B.username]],
    );

    assert.equal(
      persisted.rows.length,
      2,
      "Expected exactly two persisted account/session rows for the proof usernames.",
    );

    const rowA = persisted.rows.find(
      (row) => row.username_normalized === CREDENTIAL_A.username,
    );
    const rowB = persisted.rows.find(
      (row) => row.username_normalized === CREDENTIAL_B.username,
    );

    assert.ok(rowA && rowB, "Both proof usernames must have a persisted row.");

    assert.notEqual(
      rowA.account_id,
      rowB.account_id,
      "The two persisted accounts must have distinct ids in PostgreSQL.",
    );
    step("two distinct account rows persisted in identity_accounts");

    assert.equal(actorIdA, rowA.account_id);
    assert.equal(actorIdB, rowB.account_id);
    step("each actorId matches its own persisted account row, and not the other's");

    // ---------------------------------------------------------------------
    // The isolation primitive.
    // ---------------------------------------------------------------------

    assert.notEqual(
      actorIdA,
      actorIdB,
      "Two separately registered accounts must not share an actorId.",
    );
    step("actorId A and actorId B are distinct");

    assert.notEqual(
      registrationA.sessionId,
      registrationB.sessionId,
      "Each registration must establish its own independent session.",
    );
    step("each account holds an independent session");

    const resolvedA = await requireActor(env, bearer(registrationA.accessToken));
    const resolvedB = await requireActor(env, bearer(registrationB.accessToken));

    // (1) Credential A resolves only to actor A.
    assert.equal(resolvedA.actorId, actorIdA);
    assert.equal(resolvedA.authenticated, true);
    step("(1) credential A resolves to actor A only");

    // (2) Credential B resolves only to actor B.
    assert.equal(resolvedB.actorId, actorIdB);
    assert.equal(resolvedB.authenticated, true);
    step("(2) credential B resolves to actor B only");

    // (3) Actor A cannot resolve as actor B.
    assert.notEqual(resolvedA.actorId, actorIdB);
    step("(3) actor A never resolves as actor B");

    // (4) Actor B cannot resolve as actor A.
    assert.notEqual(resolvedB.actorId, actorIdA);
    step("(4) actor B never resolves as actor A");

    // Roles come from server-side state, never from the request.
    assert.deepEqual([...resolvedA.roles], ["BUYER"]);
    assert.deepEqual([...resolvedB.roles], ["BUYER"]);
    step("roles are server-authoritative (Q3.3 BUYER) for both actors");

    // NOTE: an absent/unknown credential is deliberately NOT asserted here.
    // The observation this slice recorded — an unrecognized credential in a
    // PostgreSQL-store environment ending at `DEPENDENCY_FAILED` instead of
    // 401 — has since been resolved by the two follow-up Phase 1 slices
    // (the `refusalForUnresolvedRequest` decision in
    // shared/auth/session.ts and the HYPERDRIVE store wiring), proven by
    // tests/m8-unauthenticated-401 and tests/m8-db-wiring. This proof
    // still stays silent on it: actor isolation is what it owns, and the
    // refusal semantics have their own proofs.

    // ---------------------------------------------------------------------
    // Credential material is never persisted in plaintext and never
    // appears in this proof's output.
    // ---------------------------------------------------------------------

    const secrets = [
      registrationA.accessToken,
      registrationA.refreshToken,
      registrationB.accessToken,
      registrationB.refreshToken,
      CREDENTIAL_A.password,
      CREDENTIAL_B.password,
    ];

    for (const row of persisted.rows) {
      assert.ok(
        row.access_token_hash !== null && row.access_token_hash.length > 0,
        "The access credential must be persisted as a non-empty digest.",
      );

      for (const secret of secrets) {
        assert.ok(
          !row.access_token_hash.includes(secret),
          "Persisted digest must not contain plaintext credential material.",
        );
      }
    }
    step("persisted access credentials are digests containing no plaintext material");

    for (const line of reported) {
      for (const secret of secrets) {
        assert.ok(
          !line.includes(secret),
          "Proof output must not contain credential material.",
        );
      }
    }
    step("proof output contains no credential material");

    // ---------------------------------------------------------------------
    // Reported row counts, for inspection.
    // ---------------------------------------------------------------------

    for (const table of [
      "identity_accounts",
      "identity_sessions",
      "identity_refresh_grants",
    ]) {
      const count = await pool.query<{ count: string }>(
        `select count(*)::text as count from ${table}`,
      );
      report(`  ${table} rows -> ${count.rows[0]?.count ?? "unknown"}`);
    }

    console.log("");
    console.log("M8 PHASE 1 SLICE 1 ACTOR ISOLATION PROOF PASSED");
  } catch (error) {
    console.error("TEST FAILED:", error);
    if (error instanceof AssertionError) {
      console.error("  Operator:", error.operator);
      console.error("  Expected:", JSON.stringify(error.expected));
      console.error("  Actual:", JSON.stringify(error.actual));
      console.error("  Stack:", error.stack);
    }
    process.exitCode = 1;
  } finally {
    await Promise.all([pool.end(), setupPool.end()]);
  }
}

void main();