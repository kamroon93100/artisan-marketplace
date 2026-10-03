import assert, { AssertionError } from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

import { IdentityService } from "../../apps/api/src/modules/identity/application/identity-service.ts";
import { PostgresSessionStore, createCredentialHasherSync } from "../../apps/api/src/modules/identity/infrastructure/postgres-session-store.ts";
import { AppError } from "../../apps/api/src/shared/errors/app-error.ts";
import { verifyPassword } from "../../apps/api/src/modules/identity/infrastructure/password.ts";
import { Pool } from "pg";

/**
 * Real-PostgreSQL runtime proof for IdentityService + PostgresSessionStore (M10-A).
 *
 * This proves the complete authentication lifecycle against a real database:
 *   register → login → wrong password → unknown username → refresh →
 *   old refresh consumed → replay detection → logout → repeated logout →
 *   access token expiry → duplicate username → reserved username →
 *   credentials never in errors → expired refresh → revoked refresh
 *
 * Additionally proves persistence across PostgreSQL restart:
 *   - account persistence
 *   - session persistence
 *   - refresh-grant persistence
 *   - consumed refresh grant persistence
 *   - replay detection after restart
 *   - revocation persistence
 *
 * The `write` and `read` phases run in separate processes with a
 * PostgreSQL restart in between, so `read` proves the auth state is
 * canonical database state rather than anything held in a live process.
 *
 * Requires a running server. It is deliberately NOT part of
 * `pnpm verify`, which is the service-free fast path; use
 * `scripts/verify-m10-auth-postgres.ps1`.
 */

type Handoff = {
  // Account
  accountId: string;
  username: string;
  usernameNormalized: string;
  password: string;

  // Initial session
  sessionId: string;
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: number;
  refreshExpiresAt: number;

  // After first refresh
  refresh1AccessToken: string;
  refresh1RefreshToken: string;

  // Replay detection
  replayDetected: boolean;
  revokedSessionId: string;

  // Logout session
  logoutSessionId: string;
  logoutRefreshToken: string;

  // Duplicate username test
  duplicateUsername: string;
};

const connectionString = process.env.M10_POSTGRES_URL;

if (!connectionString) {
  throw new Error(
    "M10_POSTGRES_URL must point at the project-local PostgreSQL instance. Use scripts/verify-m10-auth-postgres.ps1, which reads it from the Hyperdrive binding in apps/api/wrangler.jsonc.",
  );
}

/**
 * A fresh database pool and service per phase.
 *
 * The clock is injected through the `IdentityService` constructor rather
 * than assigned onto the instance, so the service keeps using its own
 * public construction contract.
 */
function freshRigs(clock?: { now: () => number }): {
  pool: Pool;
  sessionStore: PostgresSessionStore;
  identity: IdentityService;
} {
  const pool = new Pool({ connectionString });
  const hashFn = createCredentialHasherSync();
  const sessionStore = new PostgresSessionStore(pool, hashFn);

  return {
    pool,
    sessionStore,
    identity: new IdentityService(sessionStore, clock?.now),
  };
}

/**
 * Test clock for controlled time advancement.
 */
function testClock(start: number) {
  let current = start;
  return {
    now: (): number => current,
    advance(ms: number): void {
      current += ms;
    },
  };
}

async function writePhase(handoffPath: string): Promise<void> {
  // The clock starts at real wall-clock time and only moves forward.
  //
  // PostgresSessionStore.rotateRefreshGrant() enforces `refresh_expires_at`
  // against its own `Date.now()`, so a synthetic past-dated clock would make
  // every freshly issued session look expired to the store and rotation would
  // roll back. Advancing forward is what the lifetime rules actually mean.
  const clock = testClock(Date.now());
  const { pool, sessionStore, identity } = freshRigs(clock);

  // ============================================================
  // 1. REGISTER
  // ============================================================
  const username = `testuser_${randomUUID().slice(0, 8)}`;
  const password = "validpassword123456";

  const registerResult = await identity.register({ username, password });

  assert.equal(typeof registerResult.sessionId, "string");
  assert.ok(registerResult.sessionId.length > 0);
  assert.equal(typeof registerResult.accessToken, "string");
  assert.ok(registerResult.accessToken.length > 0);
  assert.equal(typeof registerResult.refreshToken, "string");
  assert.ok(registerResult.refreshToken.length > 0);
  assert.equal(typeof registerResult.accessExpiresAt, "number");
  assert.equal(typeof registerResult.refreshExpiresAt, "number");
  assert.equal(registerResult.accessExpiresAt - clock.now(), 15 * 60 * 1000);
  assert.equal(registerResult.refreshExpiresAt - clock.now(), 30 * 24 * 60 * 60 * 1000);
  assert.equal(registerResult.actor.username, username);
  assert.deepEqual(registerResult.actor.roles, ["BUYER"]);

  // Verify account was persisted
  const account = await sessionStore.findAccountByNormalizedUsername(username.toLowerCase());
  assert.ok(account);
  assert.equal(account.username, username);
  assert.equal(account.usernameNormalized, username.toLowerCase());
  assert.ok(account.passwordHash.startsWith("$argon2id$"));
  assert.deepEqual(account.roles, ["BUYER"]);

  // Verify session was persisted
  const session = await sessionStore.getAsync(registerResult.sessionId);
  assert.ok(session);
  assert.equal(session.actorId, registerResult.actor.actorId);
  assert.equal(session.roles.join(","), ["BUYER"].join(","));

  // Verify refresh grant was persisted
  const grant = await sessionStore.findUnconsumedRefreshGrant(registerResult.refreshToken);
  assert.ok(grant);
  assert.equal(grant.sessionId, registerResult.sessionId);

  // ============================================================
  // 2. LOGIN
  // ============================================================
  const loginResult = await identity.login({ username, password });

  assert.equal(typeof loginResult.sessionId, "string");
  assert.ok(loginResult.sessionId.length > 0);
  assert.notEqual(loginResult.accessToken, registerResult.accessToken);
  assert.notEqual(loginResult.refreshToken, registerResult.refreshToken);
  assert.equal(loginResult.actor.username, username);
  assert.deepEqual(loginResult.actor.roles, ["BUYER"]);

  // ============================================================
  // 3. WRONG PASSWORD → UNIFORM 401
  // ============================================================
  await assert.rejects(
    () => identity.login({ username, password: "wrongpassword123456" }),
    (error: unknown) =>
      error instanceof AppError &&
      error.code === "UNAUTHENTICATED" &&
      error.message === "Invalid username or password." &&
      error.details === undefined,
    "wrong password must return uniform 401 with no details",
  );

  // ============================================================
  // 4. UNKNOWN USERNAME → UNIFORM 401
  // ============================================================
  await assert.rejects(
    () => identity.login({ username: "nonexistentuser", password: "validpassword123456" }),
    (error: unknown) =>
      error instanceof AppError &&
      error.code === "UNAUTHENTICATED" &&
      error.message === "Invalid username or password." &&
      error.details === undefined,
    "unknown username must return uniform 401 with no details",
  );

  // ============================================================
  // 5. REFRESH (first rotation)
  // ============================================================
  const refresh1 = await identity.refreshAsync(registerResult.refreshToken);

  assert.equal(refresh1.ok, true);
  if (!refresh1.ok) throw new Error("Expected refresh to succeed");

  assert.ok(refresh1.session.accessToken.length > 0);
  assert.ok(refresh1.session.refreshToken.length > 0);
  assert.equal(refresh1.session.accessExpiresAt - clock.now(), 15 * 60 * 1000);
  assert.equal(refresh1.session.refreshExpiresAt, registerResult.refreshExpiresAt);

  const refresh1AccessToken = refresh1.session.accessToken;
  const refresh1RefreshToken = refresh1.session.refreshToken;

  // Verify old refresh grant is consumed
  const consumedGrant = await sessionStore.findRefreshGrant(registerResult.refreshToken);
  assert.ok(consumedGrant);
  assert.ok(consumedGrant.consumedAt !== null);

  // Actually, the old grant should point to the new grant
  const newGrant = await sessionStore.findUnconsumedRefreshGrant(refresh1RefreshToken);
  assert.ok(newGrant);
  assert.equal(newGrant.sessionId, registerResult.sessionId);
  assert.equal(newGrant.consumedAt, null);

  // The consumed grant should have rotated_to pointing to the new grant
  assert.equal(consumedGrant.rotatedTo, newGrant.id);

  // ============================================================
  // 6. OLD REFRESH CONSUMED (replay of original token)
  // ============================================================
  const replayOriginal = await identity.refreshAsync(registerResult.refreshToken);

  assert.equal(replayOriginal.ok, false);
  if (replayOriginal.ok) throw new Error("Expected replay to fail");
  assert.equal(replayOriginal.reason, "REFRESH_ALREADY_USED");

  // ============================================================
  // 7. SESSION REVOCATION AFTER REPLAY DETECTION
  //
  // The successor grant is still unconsumed, so this is not a replay. It must
  // fail because the replay above revoked the whole session. Proving this
  // distinguishes "revocation works" from "the token was already consumed".
  // ============================================================
  const successorAfterRevocation = await identity.refreshAsync(refresh1RefreshToken);

  assert.equal(successorAfterRevocation.ok, false);
  if (successorAfterRevocation.ok) throw new Error("Expected refresh to fail");
  assert.equal(successorAfterRevocation.reason, "SESSION_REVOKED");

  // After replay detection, the session should be revoked
  const revokedSession = await sessionStore.getAsync(registerResult.sessionId);
  assert.ok(revokedSession);
  assert.ok(revokedSession.refreshRevokedAt !== null);

  // ============================================================
  // 8. LOGOUT (on a fresh session)
  // ============================================================
  const logoutRegister = await identity.register({
    username: `logoutuser_${randomUUID().slice(0, 8)}`,
    password: "validpassword123456",
  });

  const logoutResult = await identity.logoutAsync(logoutRegister.refreshToken);

  assert.equal(logoutResult.ok, true);
  if (!logoutResult.ok) throw new Error("Expected logout to succeed");
  assert.equal(logoutResult.sessionId, logoutRegister.sessionId);

  // Verify session is revoked (refresh side only)
  const logoutSession = await sessionStore.getAsync(logoutRegister.sessionId);
  assert.ok(logoutSession);
  assert.ok(logoutSession.refreshRevokedAt !== null);
  assert.equal(logoutSession.revokedAt, null);

  // ============================================================
  // 9. REPEATED LOGOUT → IDEMPOTENT
  // ============================================================
  const logoutRepeat = await identity.logoutAsync(logoutRegister.refreshToken);

  assert.equal(logoutRepeat.ok, false);
  if (logoutRepeat.ok) throw new Error("Expected repeat logout to fail");
  assert.equal(logoutRepeat.reason, "SESSION_REVOKED");

  // ============================================================
  // 10. ACCESS TOKEN NATURAL EXPIRY AFTER LOGOUT
  // ============================================================
  const verifyAfterLogout = await identity.verifyAccessTokenAsync(logoutRegister.accessToken);
  assert.equal(verifyAfterLogout.ok, true);

  clock.advance(15 * 60 * 1000 + 1000);

  const verifyExpired = await identity.verifyAccessTokenAsync(logoutRegister.accessToken);
  assert.equal(verifyExpired.ok, false);
  if (verifyExpired.ok) throw new Error("Expected expired access token to fail");
  assert.equal(verifyExpired.reason, "SESSION_EXPIRED");

  // ============================================================
  // 11. DUPLICATE USERNAME → 409 CONFLICT
  // ============================================================
  const dupUsername = `dupuser_${randomUUID().slice(0, 8)}`;
  await identity.register({ username: dupUsername, password: "validpassword123456" });

  await assert.rejects(
    () => identity.register({ username: dupUsername, password: "validpassword123456" }),
    (error: unknown) =>
      error instanceof AppError &&
      error.code === "CONFLICT" &&
      error.message === "Username already exists." &&
      error.details?.field === "username",
    "duplicate username must return 409 CONFLICT",
  );

  // ============================================================
  // 12. RESERVED USERNAME → 400 VALIDATION_FAILED
  // ============================================================
  await assert.rejects(
    () => identity.register({ username: "admin", password: "validpassword123456" }),
    (error: unknown) =>
      error instanceof AppError &&
      error.code === "VALIDATION_FAILED" &&
      error.message === "This username is reserved." &&
      error.details?.field === "username",
    "reserved username must return 400 VALIDATION_FAILED",
  );

  // ============================================================
  // 13. CREDENTIALS NEVER IN ERRORS
  //
  // Failures here are value-returning outcomes, not exceptions, so the real
  // risk is an outcome or a rejection echoing the submitted secret. This
  // collects genuine failures that carry the caller's credential material and
  // asserts none of it survives into any observable representation.
  // ============================================================
  const secretPassword = "wrongpassword123456";
  const sentinelToken = "invalid_token_" + randomUUID();

  const observedErrors: unknown[] = [];

  try {
    await identity.login({ username, password: secretPassword });
    throw new Error("wrong password must not succeed");
  } catch (error) {
    observedErrors.push(error);
  }

  try {
    await identity.login({ username: "nonexistentuser", password: secretPassword });
    throw new Error("unknown username must not succeed");
  } catch (error) {
    observedErrors.push(error);
  }

  try {
    await identity.refreshAsync(sentinelToken);
    throw new Error("unknown refresh token must not succeed");
  } catch (error) {
    observedErrors.push(error);
  }

  const sensitiveValues = [
    secretPassword,
    sentinelToken,
    registerResult.accessToken,
    registerResult.refreshToken,
    refresh1AccessToken,
    refresh1RefreshToken,
    logoutRegister.accessToken,
    logoutRegister.refreshToken,
  ];

  for (const error of observedErrors) {
    const representations = [
      String(error),
      String((error as { message?: unknown }).message ?? ""),
      JSON.stringify(error) ?? "",
      JSON.stringify((error as { details?: unknown }).details ?? null) ?? "",
    ];

    for (const representation of representations) {
      for (const sensitive of sensitiveValues) {
        assert.ok(
          sensitive.length > 0 && !representation.includes(sensitive),
          `Error representation leaked a credential: ${representation}`,
        );
      }
    }
  }

  // The invalid-token outcomes must also stay free of the submitted token.
  const invalidRefresh = await identity.refreshAsync(sentinelToken);
  assert.equal(invalidRefresh.ok, false);
  if (invalidRefresh.ok) throw new Error("Expected unknown refresh token to fail");
  assert.equal(invalidRefresh.reason, "SESSION_UNKNOWN");

  const invalidLogout = await identity.logoutAsync(sentinelToken);
  assert.equal(invalidLogout.ok, false);
  if (invalidLogout.ok) throw new Error("Expected unknown logout token to fail");
  assert.equal(invalidLogout.reason, "SESSION_UNKNOWN");

  // ============================================================
  // 14. EXPIRED REFRESH TOKEN
  // ============================================================
  const expiredRegister = await identity.register({
    username: `expireduser_${randomUUID().slice(0, 8)}`,
    password: "validpassword123456",
  });

  clock.advance(30 * 24 * 60 * 60 * 1000 + 1000);

  const expiredRefresh = await identity.refreshAsync(expiredRegister.refreshToken);
  assert.equal(expiredRefresh.ok, false);
  if (expiredRefresh.ok) throw new Error("Expected expired refresh to fail");
  assert.equal(expiredRefresh.reason, "SESSION_EXPIRED");

  // ============================================================
  // 15. REVOKED REFRESH TOKEN
  // ============================================================
  const revokedRegister = await identity.register({
    username: `revokeduser_${randomUUID().slice(0, 8)}`,
    password: "validpassword123456",
  });

  await identity.revokeSessionAsync(revokedRegister.sessionId);

  const revokedRefresh = await identity.refreshAsync(revokedRegister.refreshToken);
  assert.equal(revokedRefresh.ok, false);
  if (revokedRefresh.ok) throw new Error("Expected revoked refresh to fail");
  assert.equal(revokedRefresh.reason, "SESSION_REVOKED");

  // ============================================================
  // Write handoff for read phase
  // ============================================================
  const handoff: Handoff = {
    accountId: registerResult.actor.actorId,
    username: registerResult.actor.username,
    usernameNormalized: username.toLowerCase(),
    password,
    sessionId: registerResult.sessionId,
    accessToken: registerResult.accessToken,
    refreshToken: registerResult.refreshToken,
    accessExpiresAt: registerResult.accessExpiresAt,
    refreshExpiresAt: registerResult.refreshExpiresAt,
    refresh1AccessToken,
    refresh1RefreshToken,
    replayDetected: true,
    revokedSessionId: registerResult.sessionId,
    logoutSessionId: logoutRegister.sessionId,
    logoutRefreshToken: logoutRegister.refreshToken,
    duplicateUsername: dupUsername,
  };

  writeFileSync(handoffPath, JSON.stringify(handoff, null, 2));

  await pool.end();

  console.log("M10 AUTH POSTGRES WRITE PHASE PASSED");
}

async function readPhase(handoffPath: string): Promise<void> {
  const handoff = JSON.parse(readFileSync(handoffPath, "utf8")) as Handoff;

  // Uses real wall-clock time, deliberately: the read phase must reason with
  // the same clock production uses, not a re-created fake one.
  const { pool, sessionStore, identity } = freshRigs();

  // ============================================================
  // B1: Account persisted
  // ============================================================
  const account = await sessionStore.findAccountByNormalizedUsername(handoff.usernameNormalized);
  assert.ok(account, "account survived restart");
  assert.equal(account.id, handoff.accountId);
  assert.equal(account.username, handoff.username);
  assert.equal(account.usernameNormalized, handoff.usernameNormalized);
  assert.ok(account.passwordHash.startsWith("$argon2id$"));

  // Verify password still works
  const valid = await verifyPassword(handoff.password, account.passwordHash);
  assert.equal(valid, true);

  // ============================================================
  // B2: Initial session persisted
  // ============================================================
  const session = await sessionStore.getAsync(handoff.sessionId);
  assert.ok(session, "initial session survived restart");
  assert.equal(session.actorId, handoff.accountId);
  assert.equal(session.roles.join(","), ["BUYER"].join(","));

  // ============================================================
  // B3: Refresh grants persisted (initial + rotated)
  // ============================================================
  const initialGrant = await sessionStore.findRefreshGrant(handoff.refreshToken);
  assert.ok(initialGrant, "initial refresh grant survived restart");
  assert.equal(initialGrant.sessionId, handoff.sessionId);
  assert.ok(initialGrant.consumedAt !== null, "initial grant should be consumed");
  assert.ok(initialGrant.rotatedTo !== null, "initial grant should point to rotated grant");

  const rotatedGrant = await sessionStore.findUnconsumedRefreshGrant(handoff.refresh1RefreshToken);
  assert.ok(rotatedGrant, "rotated refresh grant survived restart");
  assert.equal(rotatedGrant.sessionId, handoff.sessionId);
  assert.equal(rotatedGrant.consumedAt, null, "rotated grant should be unconsumed");
  assert.equal(rotatedGrant.id, initialGrant.rotatedTo, "rotated grant ID matches rotated_to");

  // ============================================================
  // B4: Replay detection still works after restart
  // ============================================================
  const replayAfterRestart = await identity.refreshAsync(handoff.refreshToken);
  assert.equal(replayAfterRestart.ok, false);
  if (replayAfterRestart.ok) throw new Error("Expected replay to fail after restart");
  assert.equal(replayAfterRestart.reason, "REFRESH_ALREADY_USED");

  // The session should still be revoked
  const revokedSession = await sessionStore.getAsync(handoff.revokedSessionId);
  assert.ok(revokedSession);
  assert.ok(revokedSession.refreshRevokedAt !== null, "session still revoked after restart");

  // ============================================================
  // B5: Logout session persisted
  // ============================================================
  const logoutSession = await sessionStore.getAsync(handoff.logoutSessionId);
  assert.ok(logoutSession, "logout session survived restart");
  assert.ok(logoutSession.refreshRevokedAt !== null, "logout session still revoked after restart");
  assert.equal(logoutSession.revokedAt, null, "access token not denylisted");

  // Repeat logout after restart should still be idempotent
  const logoutRepeatAfterRestart = await identity.logoutAsync(handoff.logoutRefreshToken);
  assert.equal(logoutRepeatAfterRestart.ok, false);
  if (logoutRepeatAfterRestart.ok) throw new Error("Expected repeat logout to fail after restart");
  assert.equal(logoutRepeatAfterRestart.reason, "SESSION_REVOKED");

  // ============================================================
  // B6: Duplicate username constraint still holds
  // ============================================================
  await assert.rejects(
    () => identity.register({ username: handoff.duplicateUsername, password: "validpassword123456" }),
    (error: unknown) =>
      error instanceof AppError &&
      error.code === "CONFLICT" &&
      error.message === "Username already exists.",
    "duplicate username constraint still enforced after restart",
  );

  await pool.end();

  console.log("M10 AUTH POSTGRES READ-AFTER-RESTART PHASE PASSED");
}

async function main(): Promise<void> {
  const [phase, handoffPath] = process.argv.slice(2);

  if (!phase || !handoffPath) {
    throw new Error(
      "Usage: auth-postgres-runtime.test.ts <write|read> <handoff-path>",
    );
  }

  try {
    if (phase === "write") {
      await writePhase(handoffPath);
      return;
    }

    if (phase === "read") {
      await readPhase(handoffPath);
      return;
    }

    throw new Error(`Unknown phase: ${phase}`);
  } catch (error) {
    console.error("TEST FAILED:", error);
    if (error instanceof AssertionError) {
      console.error("  Operator:", error.operator);
      console.error("  Expected:", JSON.stringify(error.expected));
      console.error("  Actual:", JSON.stringify(error.actual));
      console.error("  Stack:", error.stack);
    }
    process.exitCode = 1;
  }
}

void main();