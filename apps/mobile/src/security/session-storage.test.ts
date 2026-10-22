import {
  createInMemorySessionStorage,
  createSecureSessionStorage,
  isAccessTokenExpired,
  isRefreshTokenExpired,
  isStoredSession,
  SessionStorageError,
  type SecureStoreLike,
  type StoredSession,
} from './session-storage';

function expect(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`SESSION STORAGE TEST FAILED: ${message}`);
  }
}

/** Awaits a rejection and reports whether one was thrown. */
async function expectRejection(
  attempt: () => Promise<unknown>,
  message: string,
): Promise<void> {
  let threw = false;

  try {
    await attempt();
  } catch {
    threw = true;
  }

  expect(threw, message);
}

function sample(): StoredSession {
  return {
    accessToken: 'access-credential-value',
    refreshToken: 'refresh-credential-value',
    accessExpiresAt: 1800000000000,
    refreshExpiresAt: 1800000000000 + 30 * 24 * 60 * 60 * 1000,
    actorId: '22222222-2222-4222-8222-222222222222',
    username: 'buyer_one',
    roles: ['BUYER'],
  };
}

/** A key/value stand-in for the platform's secure storage. */
function fakeSecureStore(): SecureStoreLike & { dump(): Map<string, string> } {
  const values = new Map<string, string>();

  return {
    dump: () => values,
    async getItemAsync(key) {
      return values.has(key) ? values.get(key)! : null;
    },
    async setItemAsync(key, value) {
      values.set(key, value);
    },
    async deleteItemAsync(key) {
      values.delete(key);
    },
  };
}

async function testSecureStorageRoundTripsASession(): Promise<void> {
  const store = fakeSecureStore();
  const storage = createSecureSessionStorage(store);

  await storage.write(sample());
  const read = await storage.read();

  expect(read !== null, 'a written session reads back');
  expect(read?.accessToken === sample().accessToken, 'the access credential round-trips');
  expect(read?.roles[0] === 'BUYER', 'roles round-trip');
  expect(
    store.dump().get('artisan.session.refresh') === sample().refreshToken,
    'the refresh credential is stored, not dropped',
  );

  await storage.clear();
  expect((await storage.read()) === null, 'clearing removes the session');
  expect(store.dump().size === 0, 'clearing removes every stored field');
}

async function testUnreadableSessionIsReportedAsNoSession(): Promise<void> {
  const store = fakeSecureStore();
  const storage = createSecureSessionStorage(store);

  // A payload the app cannot parse is not a session; the caller signs in.
  await store.setItemAsync('artisan.session.access', 'token-only');

  expect(
    (await storage.read()) === null,
    'a partial payload is reported as no session rather than failing every request',
  );
}

async function testWriteFailureSurfacesAsAnError(): Promise<void> {
  const failing: SecureStoreLike = {
    async getItemAsync() {
      return null;
    },
    async setItemAsync() {
      throw new Error('secure storage unavailable');
    },
    async deleteItemAsync() {},
  };

  const storage = createSecureSessionStorage(failing);

  await expectRejection(
    () => storage.write(sample()),
    'a storage failure is surfaced, never silently swallowed into a lost session',
  );
}

async function testInMemoryStorageRoundTrips(): Promise<void> {
  const storage = createInMemorySessionStorage();
  const session = sample();

  await storage.write(session);
  expect((await storage.read()) === session, 'in-memory round-trip');

  await storage.clear();
  expect((await storage.read()) === null, 'in-memory clear');
}

async function testExpiryHelpers(): Promise<void> {
  // The sample session's expiries are absolute, so "now" is chosen relative
  // to them rather than compared against a value of its own.
  const session = sample();
  const liveNow = session.accessExpiresAt - 10_000;

  expect(
    !isAccessTokenExpired(session, liveNow),
    'a live access credential is not expired',
  );
  expect(
    isAccessTokenExpired(session, session.accessExpiresAt + 1),
    'a credential past its expiry is expired',
  );
  expect(
    !isRefreshTokenExpired(session, liveNow),
    'a live refresh credential is not expired',
  );
  expect(
    isRefreshTokenExpired(session, session.refreshExpiresAt + 1),
    'a credential past its expiry is expired',
  );
}

async function testParsedSessionGuard(): Promise<void> {
  expect(isStoredSession(sample()), 'a complete session passes the guard');

  const missingAccess = { ...sample(), accessToken: '' };
  expect(!isStoredSession(missingAccess), 'a session without an access credential is rejected');

  const badRoles = { ...sample(), roles: [1] };
  expect(!isStoredSession(badRoles), 'a session with non-string roles is rejected');

  expect(!isStoredSession(null), 'null is rejected');
  expect(!isStoredSession('session'), 'a string is rejected');
}

async function main(): Promise<void> {
  await testSecureStorageRoundTripsASession();
  await testUnreadableSessionIsReportedAsNoSession();
  await testWriteFailureSurfacesAsAnError();
  await testInMemoryStorageRoundTrips();
  await testExpiryHelpers();
  await testParsedSessionGuard();

  console.log('MOBILE SESSION STORAGE TESTS PASSED');
}

void main().catch((error) => {
  console.error('MOBILE SESSION STORAGE TESTS FAILED');
  console.error(error);
  process.exitCode = 1;
});
