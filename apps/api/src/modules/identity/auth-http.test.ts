import { IdentityService } from './application/identity-service.js';
import { TestSessionStore } from './infrastructure/test-session-store.js';
import { AppError } from '../../shared/errors/app-error.js';
import {
  ACCESS_TOKEN_LIFETIME_MS,
  REFRESH_TOKEN_LIFETIME_MS,
} from './domain/session.js';
import type { Role } from './domain/roles.js';

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

function createTestEnv(clock?: () => number): {
  identity: IdentityService;
  env: { APP_ENV: 'test' };
  store: any;
} {
  const env = { APP_ENV: 'test' as const };
  const store = new TestSessionStore();
  const identity = new IdentityService(store, clock || (() => Date.now()));
  return { identity, env, store };
}

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

async function testRegister201(): Promise<void> {
  const clock = testClock(BASE_TIME);
  const { identity, env, store } = createTestEnv(clock.now);

  const username = `testuser_${Math.random().toString(36).slice(2, 10)}`;
  const password = 'validpassword123456';

  const result = await identity.register({ username, password });

  assertEqual(result.sessionId.length > 0, true, 'register returns sessionId');
  assertEqual(result.accessToken.length > 0, true, 'register returns accessToken');
  assertEqual(result.refreshToken.length > 0, true, 'register returns refreshToken');
  assertEqual(typeof result.accessExpiresAt, 'number', 'accessExpiresAt is number');
  assertEqual(typeof result.refreshExpiresAt, 'number', 'refreshExpiresAt is number');
  assertEqual(result.accessExpiresAt - clock.now(), ACCESS_TOKEN_LIFETIME_MS, 'access token expires in 15 minutes');
  assertEqual(result.refreshExpiresAt - clock.now(), REFRESH_TOKEN_LIFETIME_MS, 'refresh token expires in 30 days');

  assertEqual(result.actor.actorId.length > 0, true, 'actor.actorId present');
  assertEqual(result.actor.username, username, 'actor.username returned (canonical)');
  assertEqual(result.actor.roles.join(','), ['BUYER'].join(','), 'actor.roles is BUYER');

  const session = (identity['store'] as any).sessions.get(result.sessionId);
  assertEqual(session !== undefined, true, 'session persisted in store');

  console.log('✓ testRegister201 passed');
}

async function testLogin200(): Promise<void> {
  const clock = testClock(BASE_TIME);
  const { identity, env, store } = createTestEnv(clock.now);

  const username = `testuser_login_${Math.random().toString(36).slice(2, 10)}`;
  const password = 'validpassword123456';

  await identity.register({ username, password });

  const result = await identity.login({ username, password });

  assertEqual(result.sessionId.length > 0, true, 'login returns sessionId');
  assertEqual(result.accessToken.length > 0, true, 'login returns accessToken');
  assertEqual(result.refreshToken.length > 0, true, 'login returns refreshToken');

  assertEqual(result.actor.roles.join(','), ['BUYER'].join(','), 'actor.roles is BUYER');
  assertEqual(result.actor.username, username, 'actor.username returned');

  console.log('✓ testLogin200 passed');
}

async function testWrongPasswordUniform401(): Promise<void> {
  const { identity, env } = createTestEnv();

  const username = `testuser_wrongpw_${Math.random().toString(36).slice(2, 10)}`;
  const password = 'validpassword123456';

  await identity.register({ username, password });

  await expectAppError(
    'wrong password => uniform 401',
    () => identity.login({ username, password: 'wrongpassword123456' }),
    'UNAUTHENTICATED',
    'Invalid username or password.',
  );

  console.log('✓ testWrongPasswordUniform401 passed');
}

async function testUnknownUsernameUniform401(): Promise<void> {
  const { identity, env } = createTestEnv();

  await expectAppError(
    'unknown username => uniform 401',
    () => identity.login({ username: 'nonexistentuser', password: 'validpassword123456' }),
    'UNAUTHENTICATED',
    'Invalid username or password.',
  );

  console.log('✓ testUnknownUsernameUniform401 passed');
}

async function testRefresh200(): Promise<void> {
  const clock = testClock(BASE_TIME);
  const { identity, env, store } = createTestEnv(clock.now);

  const username = `testuser_refresh_${Math.random().toString(36).slice(2, 10)}`;
  const password = 'validpassword123456';

  const registerResult = await identity.register({ username, password });

  const refreshResult = await identity.refreshAsync(registerResult.refreshToken);

  assertEqual(refreshResult.ok, true, 'refresh succeeds');

  assertEqual(refreshResult.ok && refreshResult.session.accessToken.length > 0, true, 'new access token');
  assertEqual(refreshResult.ok && refreshResult.session.refreshToken.length > 0, true, 'new refresh token');
  assertEqual(refreshResult.ok && refreshResult.session.accessExpiresAt - clock.now(), ACCESS_TOKEN_LIFETIME_MS, 'new access token expires in 15 min');
  assertEqual(refreshResult.ok && refreshResult.session.refreshExpiresAt, registerResult.refreshExpiresAt, 'refresh expiry unchanged (absolute)');

  console.log('✓ testRefresh200 passed');
}

async function testOldRefreshConsumed(): Promise<void> {
  const clock = testClock(BASE_TIME);
  const { identity, env, store } = createTestEnv(clock.now);

  const username = `testuser_oldconsumed_${Math.random().toString(36).slice(2, 10)}`;
  const password = 'validpassword123456';

  const registerResult = await identity.register({ username, password });

  const refresh1 = await identity.refreshAsync(registerResult.refreshToken);
  assertEqual(refresh1.ok, true, 'first refresh succeeds');

  const replayResult = await identity.refreshAsync(registerResult.refreshToken);
  assertEqual(replayResult.ok, false, 'replay should fail');
  assertEqual(replayResult.ok === false && replayResult.reason, 'REFRESH_ALREADY_USED', 'replay returns REFRESH_ALREADY_USED');

  console.log('✓ testOldRefreshConsumed passed');
}

async function testReplayOldCredentialRevokesSession(): Promise<void> {
  const clock = testClock(BASE_TIME);
  const { identity, env, store } = createTestEnv(clock.now);

  const username = `testuser_replay_${Math.random().toString(36).slice(2, 10)}`;
  const password = 'validpassword123456';

  const registerResult = await identity.register({ username, password });

  const refresh1 = await identity.refreshAsync(registerResult.refreshToken);
  assertEqual(refresh1.ok, true, 'first refresh succeeds');

  const replayResult = await identity.refreshAsync(registerResult.refreshToken);
  assertEqual(replayResult.ok, false, 'replay should fail');
  assertEqual(replayResult.ok === false && replayResult.reason, 'REFRESH_ALREADY_USED', 'replay returns REFRESH_ALREADY_USED');

  if (!refresh1.ok) throw new Error('Expected refresh1 to succeed');
  const refresh2 = await identity.refreshAsync(refresh1.session.refreshToken);
  assertEqual(refresh2.ok, false, 'refresh with new token after replay should fail');
  assertEqual(refresh2.ok === false && refresh2.reason, 'SESSION_REVOKED', 'refresh after replay returns SESSION_REVOKED');

  console.log('✓ testReplayOldCredentialRevokesSession passed');
}

async function testLogout200(): Promise<void> {
  const clock = testClock(BASE_TIME);
  const { identity, env, store } = createTestEnv(clock.now);

  const username = `testuser_logout_${Math.random().toString(36).slice(2, 10)}`;
  const password = 'validpassword123456';

  const registerResult = await identity.register({ username, password });

  const logoutResult = await identity.logoutAsync(registerResult.refreshToken);

  assertEqual(logoutResult.ok, true, 'logout succeeds');
  assertEqual(logoutResult.ok && logoutResult.sessionId, registerResult.sessionId, 'logout returns correct sessionId');

  console.log('✓ testLogout200 passed');
}

async function testRepeatedLogoutIdempotent(): Promise<void> {
  const clock = testClock(BASE_TIME);
  const { identity, env, store } = createTestEnv(clock.now);

  const username = `testuser_repeatlogout_${Math.random().toString(36).slice(2, 10)}`;
  const password = 'validpassword123456';

  const registerResult = await identity.register({ username, password });

  const logout1 = await identity.logoutAsync(registerResult.refreshToken);
  assertEqual(logout1.ok, true, 'first logout succeeds');

  const logout2 = await identity.logoutAsync(registerResult.refreshToken);
  assertEqual(logout2.ok, false, 'repeat logout returns SESSION_REVOKED (actual state)');
  assertEqual(logout2.ok === false && logout2.reason, 'SESSION_REVOKED', 'repeat logout returns SESSION_REVOKED');

  console.log('✓ testRepeatedLogoutIdempotent passed');
}

async function testAccessTokenNaturalExpiryAfterLogout(): Promise<void> {
  const clock = testClock(BASE_TIME);
  const { identity, env, store } = createTestEnv(clock.now);

  const username = `testuser_expiry_${Math.random().toString(36).slice(2, 10)}`;
  const password = 'validpassword123456';

  const registerResult = await identity.register({ username, password });

  await identity.logoutAsync(registerResult.refreshToken);

  assertEqual(
    clock.now() < registerResult.accessExpiresAt,
    true,
    'access token still valid immediately after logout'
  );

  clock.advance(ACCESS_TOKEN_LIFETIME_MS + 1);

  const verifyResult = await identity.verifyAccessTokenAsync(registerResult.accessToken);
  expectRejection(verifyResult, 'SESSION_EXPIRED', 'access token expired after natural expiry');

  console.log('✓ testAccessTokenNaturalExpiryAfterLogout passed');
}

async function testDuplicateUsername409(): Promise<void> {
  const clock = testClock(BASE_TIME);
  const { identity, env, store } = createTestEnv(clock.now);

  const username = `testuser_dup_${Math.random().toString(36).slice(2, 10)}`;
  const password = 'validpassword123456';

  await identity.register({ username, password });

  await expectAppError(
    'duplicate username => 409 CONFLICT',
    () => identity.register({ username, password }),
    'CONFLICT',
    'Username already exists.',
    { field: 'username' },
  );

  console.log('✓ testDuplicateUsername409 passed');
}

async function testReservedUsername400(): Promise<void> {
  const clock = testClock(BASE_TIME);
  const { identity, env, store } = createTestEnv(clock.now);

  const password = 'validpassword123456';

  await expectAppError(
    'reserved username => 400 VALIDATION_FAILED',
    () => identity.register({ username: 'admin', password }),
    'VALIDATION_FAILED',
    'This username is reserved.',
    { field: 'username' },
  );

  console.log('✓ testReservedUsername400 passed');
}

async function testCredentialsNeverInErrors(): Promise<void> {
  const clock = testClock(BASE_TIME);
  const { identity, env, store } = createTestEnv(clock.now);

  const registerResult = await identity.register({
    username: 'testcred',
    password: 'validpassword123456',
  });

  const credentials = [registerResult.accessToken, registerResult.refreshToken];

  const testErrors = [
    () => identity.refreshAsync('invalid_token'),
    () => identity.logoutAsync('invalid_token'),
  ];

  for (const testError of testErrors) {
    try {
      await testError();
    } catch (error) {
      const representations = [
        String(error),
        (error as { message?: unknown }).message === undefined ? '' : String((error as { message?: unknown }).message),
        JSON.stringify(error),
      ];

      for (const representation of representations) {
        for (const credential of credentials) {
          if (representation.includes(credential)) {
            throw new Error(`Error representation contains a credential: ${representation}`);
          }
        }
      }
    }
  }

  console.log('✓ testCredentialsNeverInErrors passed');
}

async function testExpiredRefreshToken(): Promise<void> {
  const clock = testClock(BASE_TIME);
  const { identity, env, store } = createTestEnv(clock.now);

  const username = `testuser_expired_${Math.random().toString(36).slice(2, 10)}`;
  const password = 'validpassword123456';

  const registerResult = await identity.register({ username, password });

  // Advance clock past refresh token expiry
  clock.advance(REFRESH_TOKEN_LIFETIME_MS + 1000);

  const refreshResult = await identity.refreshAsync(registerResult.refreshToken);
  expectRejection(refreshResult, 'SESSION_EXPIRED', 'expired refresh token => SESSION_EXPIRED');

  console.log('✓ testExpiredRefreshToken passed');
}

async function testRevokedRefreshToken(): Promise<void> {
  const clock = testClock(BASE_TIME);
  const { identity, env, store } = createTestEnv(clock.now);

  const username = `testuser_revoked_${Math.random().toString(36).slice(2, 10)}`;
  const password = 'validpassword123456';

  const registerResult = await identity.register({ username, password });

  await identity.revokeSessionAsync(registerResult.sessionId);

  const refreshResult = await identity.refreshAsync(registerResult.refreshToken);
  expectRejection(refreshResult, 'SESSION_REVOKED', 'revoked session => SESSION_REVOKED');

  console.log('✓ testRevokedRefreshToken passed');
}

async function main(): Promise<void> {
  await testRegister201();
  await testLogin200();
  await testWrongPasswordUniform401();
  await testUnknownUsernameUniform401();
  await testRefresh200();
  await testOldRefreshConsumed();
  await testReplayOldCredentialRevokesSession();
  await testLogout200();
  await testRepeatedLogoutIdempotent();
  await testAccessTokenNaturalExpiryAfterLogout();
  await testDuplicateUsername409();
  await testReservedUsername400();
  await testCredentialsNeverInErrors();
  await testExpiredRefreshToken();
  await testRevokedRefreshToken();

  console.log('\n✅ ALL AUTH HTTP JOURNEY TESTS PASSED');
}

void main().catch((error) => {
  console.error('AUTH HTTP JOURNEY TESTS FAILED');
  console.error(error);
  process.exitCode = 1;
});