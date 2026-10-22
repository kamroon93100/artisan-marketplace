
import {
  HttpAuthTransport,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  AuthTransportError,
  parseIssuedSession,
  validateRegistration,
} from './auth-transport';
import { createInMemorySessionStorage } from '../security/session-storage';
import {
  authorizationHeaders,
  createSessionClient,
  installSessionClient,
  currentSession,
  signOut,
} from './authorization';
import type { StoredSession } from '../security/session-storage';

process.env.EXPO_PUBLIC_API_URL = 'http://127.0.0.1:8787';

const originalFetch = globalThis.fetch;

function restore(): void {
  globalThis.fetch = originalFetch;
  installSessionClient(null);
}

function expect(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`MOBILE AUTH TEST FAILED: ${message}`);
  }
}

/** Awaits a rejection and reports whether the error matched the predicate. */
async function expectRejection(
  attempt: () => Promise<unknown>,
  matches: (error: unknown) => boolean,
  message: string,
): Promise<void> {
  let thrown: unknown = null;

  try {
    await attempt();
  } catch (error) {
    thrown = error;
  }

  expect(thrown !== null && matches(thrown), message);
}

function isAuthError(code: string): (error: unknown) => boolean {
  return (error) => error instanceof AuthTransportError && error.code === code;
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function sessionBody(overrides: Record<string, unknown> = {}): unknown {
  return {
    session: {
      sessionId: '11111111-1111-4111-8111-111111111111',
      accessToken: 'access-credential-value',
      refreshToken: 'refresh-credential-value',
      accessExpiresAt: 1800000000000,
      refreshExpiresAt: 1800000000000 + 30 * 24 * 60 * 60 * 1000,
      actor: {
        actorId: '22222222-2222-4222-8222-222222222222',
        username: 'buyer_one',
        roles: ['BUYER'],
      },
      ...overrides,
    },
  };
}

/** A body captured from the transport, with any credential values removed. */
type CapturedRequest = {
  url: string;
  method: string;
  authorization: string | null;
  body: Record<string, unknown> | null;
};

function capture(implementation: (request: CapturedRequest) => Response): void {
  globalThis.fetch = (async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const headers = new Headers(init?.headers);
    const text = typeof init?.body === 'string' ? init.body : null;

    return implementation({
      url: String(input),
      method: init?.method ?? 'GET',
      authorization: headers.get('authorization'),
      body: text === null ? null : JSON.parse(text),
    });
  }) as typeof fetch;
}

async function testRegistrationIsValidatedBeforeAnyRequest(): Promise<void> {
  const transport = new HttpAuthTransport(
    createInMemorySessionStorage(),
    originalFetch,
  );

  let requests = 0;
  capture(() => {
    requests += 1;
    return jsonResponse({}, 201);
  });

  await expectRejection(
    () => transport.register({ username: 'ab', password: 'x'.repeat(20) }),
    isAuthError('INVALID_CREDENTIALS'),
    'a malformed username must be refused client-side',
  );
  await expectRejection(
    () => transport.register({ username: 'good_name', password: 'short' }),
    isAuthError('INVALID_CREDENTIALS'),
    'a password under the minimum must be refused client-side',
  );

  expect(requests === 0, 'invalid input must not reach the network');
  restore();
}

async function testRegisterStoresTheIssuedSession(): Promise<void> {
  const storage = createInMemorySessionStorage();
  const transport = new HttpAuthTransport(storage);

  capture(() => jsonResponse(sessionBody({ accessToken: 'first-access' }), 201));

  const session = await transport.register({
    username: 'buyer_one',
    password: 'x'.repeat(PASSWORD_MIN_LENGTH),
  });

  expect(session.accessToken === 'first-access', 'the issued pair is returned');
  expect(
    session.roles.length === 1 && session.roles[0] === 'BUYER',
    'roles are carried through exactly as the server sent them',
  );

  const stored = await storage.read();
  expect(stored !== null, 'the session is stored after register');
  expect(
    stored?.accessToken === 'first-access',
    'the stored access credential matches the issued one',
  );
  restore();
}

async function testLoginReportsARejectionAsUniform(): Promise<void> {
  const storage = createInMemorySessionStorage();
  const transport = new HttpAuthTransport(storage);

  for (const body of [
    { error: { code: 'UNAUTHENTICATED', message: 'Invalid username or password.' } },
    { error: { code: 'UNAUTHENTICATED', message: 'Invalid username or password.' } },
  ]) {
    capture(() => jsonResponse(body, 401));

    await expectRejection(
      () => transport.login({ username: 'buyer_one', password: 'x'.repeat(PASSWORD_MIN_LENGTH) }),
      isAuthError('CREDENTIALS_REJECTED'),
      'a refused credential is reported uniformly',
    );
  }

  expect((await storage.read()) === null, 'a refused login stores nothing');
  restore();
}

async function testLoginMapsATakenUsername(): Promise<void> {
  const storage = createInMemorySessionStorage();
  const transport = new HttpAuthTransport(storage);

  capture(() =>
    jsonResponse(
      { error: { code: 'CONFLICT', message: 'Username already exists.' } },
      409,
    ),
  );

  await expectRejection(
    () =>
      transport.register({
        username: 'buyer_one',
        password: 'x'.repeat(PASSWORD_MIN_LENGTH),
      }),
    isAuthError('USERNAME_TAKEN'),
    'a duplicate username is reported as taken',
  );
  restore();
}

async function testRefreshWritesTheRotatedPairBeforeReturning(): Promise<void> {
  const storage = createInMemorySessionStorage();

  await storage.write({
    accessToken: 'old-access',
    refreshToken: 'old-refresh',
    accessExpiresAt: 1,
    refreshExpiresAt: 1800000000000,
    actorId: '22222222-2222-4222-8222-222222222222',
    username: 'buyer_one',
    roles: ['BUYER'],
  });

  const transport = new HttpAuthTransport(storage);
  const captured: CapturedRequest[] = [];

  capture((request) => {
    captured.push(request);
    return jsonResponse(
      sessionBody({ accessToken: 'new-access', refreshToken: 'new-refresh' }),
      200,
    );
  });

  const renewed = await transport.refresh('old-refresh');

  expect(renewed !== null, 'a successful refresh returns the new pair');
  expect(renewed?.accessToken === 'new-access', 'the access credential rotated');

  const stored = await storage.read();
  expect(
    stored?.refreshToken === 'new-refresh',
    'the rotated refresh credential is stored before the call resolves, so a spent credential is never kept',
  );
  expect(
    captured.length === 1 && captured[0]?.body?.refreshToken === 'old-refresh',
    'the spent credential was sent',
  );  restore();
}

async function testRefreshFailureEndsTheSession(): Promise<void> {
  const storage = createInMemorySessionStorage();

  await storage.write({
    accessToken: 'old-access',
    refreshToken: 'spent-refresh',
    accessExpiresAt: 1,
    refreshExpiresAt: 1800000000000,
    actorId: '22222222-2222-4222-8222-222222222222',
    username: 'buyer_one',
    roles: ['BUYER'],
  });

  const transport = new HttpAuthTransport(storage);

  // A replayed refresh credential is refused with the one reason the server
  // distinguishes; every other 401 is the uniform refusal.
  capture(() =>
    jsonResponse(
      {
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Session revoked.',
          details: { reason: 'SESSION_REVOKED' },
        },
      },
      401,
    ),
  );

  const result = await transport.refresh('spent-refresh');
  expect(result === null, 'a refused refresh reports no session');
  expect(
    (await storage.read()) === null,
    'a refused refresh clears the stored session so the app asks for credentials instead of looping',
  );
  restore();
}

async function testLogoutClearsTheDeviceEvenWhenTheServerIsUnreachable(): Promise<void> {
  const storage = createInMemorySessionStorage();

  await storage.write({
    accessToken: 'access',
    refreshToken: 'refresh',
    accessExpiresAt: 1800000000000,
    refreshExpiresAt: 1800000000000,
    actorId: '22222222-2222-4222-8222-222222222222',
    username: 'buyer_one',
    roles: ['BUYER'],
  });

  const transport = new HttpAuthTransport(storage);
  capture(() => jsonResponse({ error: { code: 'DEPENDENCY_FAILED' } }, 503));

  await expectRejection(
    () => transport.logout('refresh'),
    isAuthError('UNAVAILABLE'),
    'an unreachable server during logout is reported',
  );
  expect(
    (await storage.read()) === null,
    'the device copy of the session is cleared even when the server could not confirm the logout',
  );
  restore();
}

async function testIssuedSessionIsRejectedWhenIncomplete(): Promise<void> {
  const incomplete = sessionBody({ accessToken: undefined });
  let threw = false;
  try {
    parseIssuedSession(incomplete);
  } catch (error) {
    threw = error instanceof AuthTransportError;
  }
  expect(threw, 'a session missing its access credential must not be storable');

  const valid = parseIssuedSession(sessionBody());
  expect(valid.actor.username === 'buyer_one', 'a complete session parses');
}

async function testAuthorizationSeamSendsTheCurrentCredential(): Promise<void> {
  const storage = createInMemorySessionStorage();
  const now = () => 1_800_000_000_000;

  await storage.write({
    accessToken: 'live-access',
    refreshToken: 'live-refresh',
    accessExpiresAt: now() + 10 * 60 * 1000,
    refreshExpiresAt: now() + 30 * 24 * 60 * 60 * 1000,
    actorId: '22222222-2222-4222-8222-222222222222',
    username: 'buyer_one',
    roles: ['BUYER'],
  });

  const client = createSessionClient({
    storage,
    auth: {
      register: async () => {
        throw new Error('unused');
      },
      login: async () => {
        throw new Error('unused');
      },
      refresh: async () => null,
      logout: async () => {},
    },
    now,
  });

  installSessionClient(client);

  const headers = await authorizationHeaders();
  expect(
    headers.authorization === 'Bearer live-access',
    'a live access credential is sent as a bearer header',
  );
  restore();
}

async function testAuthorizationSeamSendsNothingWithoutASession(): Promise<void> {
  const client = createSessionClient({
    storage: createInMemorySessionStorage(),
    auth: {
      register: async () => {
        throw new Error('unused');
      },
      login: async () => {
        throw new Error('unused');
      },
      refresh: async () => null,
      logout: async () => {},
    },
  });

  installSessionClient(client);

  expect(
    Object.keys(await authorizationHeaders()).length === 0,
    'a request with no session goes out anonymous',
  );
  expect((await currentSession()) === null, 'no session reports none');
  restore();
}

async function testAuthorizationSeamRenewsAnExpiredCredential(): Promise<void> {
  const storage = createInMemorySessionStorage();
  const now = () => 1_800_000_000_000;

  await storage.write({
    accessToken: 'expired-access',
    refreshToken: 'usable-refresh',
    accessExpiresAt: now() - 1000,
    refreshExpiresAt: now() + 30 * 24 * 60 * 60 * 1000,
    actorId: '22222222-2222-4222-8222-222222222222',
    username: 'buyer_one',
    roles: ['BUYER'],
  });

  const renewed: StoredSession = {
    accessToken: 'renewed-access',
    refreshToken: 'renewed-refresh',
    accessExpiresAt: now() + 10 * 60 * 1000,
    refreshExpiresAt: now() + 30 * 24 * 60 * 60 * 1000,
    actorId: '22222222-2222-4222-8222-222222222222',
    username: 'buyer_one',
    roles: ['BUYER'],
  };

  let refreshes = 0;
  const client = createSessionClient({
    storage,
    auth: {
      register: async () => {
        throw new Error('unused');
      },
      login: async () => {
        throw new Error('unused');
      },
      refresh: async (credential) => {
        refreshes += 1;
        expect(credential === 'usable-refresh', 'the stored refresh credential is used');
        return renewed;
      },
      logout: async () => {},
    },
    now,
  });

  installSessionClient(client);

  const headers = await authorizationHeaders();
  expect(
    headers.authorization === 'Bearer renewed-access',
    'an expired access credential is renewed before the request is sent',
  );
  expect(refreshes === 1, 'one renewal per request');
  expect(
    (await storage.read())?.refreshToken === 'renewed-refresh',
    'the renewal persisted the rotated pair',
  );
  restore();
}

async function testSessionClientClearsASessionThatCannotBeRenewed(): Promise<void> {
  const storage = createInMemorySessionStorage();
  const now = () => 1_800_000_000_000;

  await storage.write({
    accessToken: 'expired-access',
    refreshToken: 'expired-refresh',
    accessExpiresAt: now() - 1000,
    refreshExpiresAt: now() - 1000,
    actorId: '22222222-2222-4222-8222-222222222222',
    username: 'buyer_one',
    roles: ['BUYER'],
  });

  const client = createSessionClient({
    storage,
    auth: {
      register: async () => {
        throw new Error('unused');
      },
      login: async () => {
        throw new Error('unused');
      },
      refresh: async () => null,
      logout: async () => {},
    },
    now,
  });

  installSessionClient(client);

  expect(
    (await authorizationHeaders()).authorization === undefined,
    'an unrenewable session is treated as anonymous',
  );
  expect(
    (await storage.read()) === null,
    'an unrenewable session is cleared rather than retried forever',
  );
  restore();
}

async function testSignOutAlwaysClearsTheDevice(): Promise<void> {
  const storage = createInMemorySessionStorage();
  let logoutCalls = 0;

  await storage.write({
    accessToken: 'access',
    refreshToken: 'refresh',
    accessExpiresAt: 1800000000000,
    refreshExpiresAt: 1800000000000,
    actorId: '22222222-2222-4222-8222-222222222222',
    username: 'buyer_one',
    roles: ['BUYER'],
  });

  const client = createSessionClient({
    storage,
    auth: {
      register: async () => {
        throw new Error('unused');
      },
      login: async () => {
        throw new Error('unused');
      },
      refresh: async () => null,
      logout: async () => {
        logoutCalls += 1;
      },
    },
  });

  installSessionClient(client);
  await signOut();

  expect(logoutCalls === 1, 'the server is told to revoke the session');
  expect((await storage.read()) === null, 'the device copy is cleared');
  restore();
}

async function main(): Promise<void> {
  await testRegistrationIsValidatedBeforeAnyRequest();
  await testRegisterStoresTheIssuedSession();
  await testLoginReportsARejectionAsUniform();
  await testLoginMapsATakenUsername();
  await testRefreshWritesTheRotatedPairBeforeReturning();
  await testRefreshFailureEndsTheSession();
  await testLogoutClearsTheDeviceEvenWhenTheServerIsUnreachable();
  await testIssuedSessionIsRejectedWhenIncomplete();
  await testAuthorizationSeamSendsTheCurrentCredential();
  await testAuthorizationSeamSendsNothingWithoutASession();
  await testAuthorizationSeamRenewsAnExpiredCredential();
  await testSessionClientClearsASessionThatCannotBeRenewed();
  await testSignOutAlwaysClearsTheDevice();
  // The password bounds are asserted here as well so a change to the
  // client-side minimum cannot drift from the server's Q5.3 rules silently.
  expect(PASSWORD_MIN_LENGTH === 15, 'the client password minimum is 15');
  expect(PASSWORD_MAX_LENGTH === 1024, 'the client password maximum is 1024');

  console.log('MOBILE AUTH TRANSPORT AND AUTHORIZATION TESTS PASSED');
  restore();
}

void main().catch((error) => {
  console.error('MOBILE AUTH TRANSPORT TESTS FAILED');
  console.error(error);
  restore();
  process.exitCode = 1;
});
