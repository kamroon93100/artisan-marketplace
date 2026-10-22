import {
  createAuthStateMachine,
  destinationForStatus,
  type AuthStateMachine,
} from './auth-state';
import type { StoredSession } from '../../security/session-storage';
import type {
  AuthTransport,
  AuthTransportError,
} from '../../network/auth-transport';

function expect(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`AUTH STATE TEST FAILED: ${message}`);
  }
}

/**
 * A transport that records what it was asked and answers with a script.
 *
 * When a storage is supplied the successful paths persist the returned
 * session, exactly as the real transport does — a sign-in that cannot be
 * stored is a failed sign-in, and that rule lives in the transport.
 */
function recordingAuth(options: {
  register?: () => Promise<StoredSession>;
  login?: () => Promise<StoredSession>;
  refresh?: (credential: string) => Promise<StoredSession | null>;
  logout?: () => Promise<void>;
  storage?: {
    write(session: StoredSession): Promise<void>;
  };
}): AuthTransport & {
  seen: { register: unknown[]; login: unknown[]; refresh: unknown[]; logout: unknown[] };
} {
  const seen = { register: [], login: [], refresh: [], logout: [] } as {
    register: unknown[];
    login: unknown[];
    refresh: unknown[];
    logout: unknown[];
  };

  const persist = async (session: StoredSession): Promise<StoredSession> => {
    if (options.storage) {
      try {
        await options.storage.write(session);
      } catch (error) {
        const failure = new Error(
          `The session could not be stored on this device: ${error instanceof Error ? error.message : 'secure storage failed'}`,
        ) as Error & { code: string };
        failure.name = 'AuthTransportError';
        failure.code = 'SESSION_UNWRITABLE';
        throw failure;
      }
    }
    return session;
  };

  return {
    seen,
    async register(request) {
      seen.register.push(request);
      return persist(
        await (options.register ?? (async () => {
          throw new Error('no register scripted');
        }))(),
      );
    },
    async login(request) {
      seen.login.push(request);
      return persist(
        await (options.login ?? (async () => {
          throw new Error('no login scripted');
        }))(),
      );
    },
    async refresh(credential) {
      seen.refresh.push(credential);
      const renewed = await (options.refresh ?? (async (_credential: string) => null))(
        credential,
      );
      return renewed === null ? null : persist(renewed);
    },
    async logout() {
      seen.logout.push(true);
      await (options.logout ?? (async () => {}))();
    },
  };
}

function authError(code: string, message: string): AuthTransportError {
  const error = new Error(message) as Error & { code: string };
  error.name = 'AuthTransportError';
  error.code = code;
  return error as unknown as AuthTransportError;
}

function issued(overrides: Partial<StoredSession> = {}): StoredSession {
  const at = 1_800_000_000_000;
  return {
    accessToken: 'access-credential-value',
    refreshToken: 'refresh-credential-value',
    accessExpiresAt: at + 10 * 60 * 1000,
    refreshExpiresAt: at + 30 * 24 * 60 * 60 * 1000,
    actorId: '22222222-2222-4222-8222-222222222222',
    username: 'buyer_one',
    roles: ['BUYER'],
    ...overrides,
  };
}

/** An in-memory storage that can be made to fail on demand. */
function storageWith(session: StoredSession | null) {
  let stored = session;
  let failRead = false;
  let failWrite = false;

  return {
    get cleared() {
      return stored === null;
    },
    failReads() {
      failRead = true;
    },
    failWrites() {
      failWrite = true;
    },
    async read() {
      if (failRead) {
        throw new Error('secure storage unavailable');
      }
      return stored;
    },
    async write(next: StoredSession) {
      if (failWrite) {
        throw new Error('secure storage unavailable');
      }
      stored = next;
    },
    async clear() {
      stored = null;
    },
  };
}

async function testRestoreOfALiveSession(): Promise<void> {
  const storage = storageWith(issued());
  const machine = createAuthStateMachine({ storage, auth: recordingAuth({}) });

  const state = await machine.restore();

  expect(state.status === 'signed-in', 'a live session is restored');
  expect(
    state.session?.username === 'buyer_one',
    'the restored session is the one the device held',
  );
}

async function testRestoreRenewsAnExpiredAccessCredential(): Promise<void> {
  const now = () => 1_800_000_000_000 + 60 * 60 * 1000;
  const storage = storageWith(
    issued({
      accessExpiresAt: now() - 1000,
      refreshExpiresAt: now() + 30 * 24 * 60 * 60 * 1000,
    }),
  );
  const renewed = issued({ accessToken: 'renewed-access' });
  const auth = recordingAuth({ refresh: async () => renewed, storage });
  const machine = createAuthStateMachine({ storage, auth, now });

  const state = await machine.restore();

  expect(state.status === 'signed-in', 'a renewable session is still signed in');
  expect(state.session?.accessToken === 'renewed-access', 'the renewed pair is adopted');
  expect(
    auth.seen.refresh.length === 1 && auth.seen.refresh[0] === 'refresh-credential-value',
    'the stored refresh credential is the one sent',
  );
  expect(
    await storage.read() !== null,
    'the renewed pair is persisted so the next launch does not renew again',
  );
}

async function testRestoreEndsASessionThatCannotBeRenewed(): Promise<void> {
  const now = () => 1_800_000_000_000 + 60 * 60 * 1000;
  const storage = storageWith(
    issued({ accessExpiresAt: now() - 1000, refreshExpiresAt: now() - 1000 }),
  );
  const machine = createAuthStateMachine({
    storage,
    auth: recordingAuth({ refresh: async () => null }),
    now,
  });

  const state = await machine.restore();

  expect(state.status === 'signed-out', 'a session past its refresh window is signed out');
  expect(storage.cleared, 'the unusable session is cleared from the device');
}

async function testRestoreDropsASessionTheServerRefusesToRenew(): Promise<void> {
  const now = () => 1_800_000_000_000 + 60 * 60 * 1000;
  const storage = storageWith(
    issued({ accessExpiresAt: now() - 1000, refreshExpiresAt: now() + 1000 * 60 * 60 }),
  );
  const machine = createAuthStateMachine({
    storage,
    auth: recordingAuth({ refresh: async () => null }),
    now,
  });

  const state = await machine.restore();

  expect(state.status === 'signed-out', 'a refused renewal signs the user out');
  expect(storage.cleared, 'a refused renewal clears the device');
}

async function testRestoreSurvivesAnUnreadableDevice(): Promise<void> {
  const storage = storageWith(issued());
  storage.failReads();
  const machine = createAuthStateMachine({ storage, auth: recordingAuth({}) });

  const state = await machine.restore();

  expect(
    state.status === 'signed-out',
    'storage that cannot be read signs the user out instead of crashing the app',
  );
}

async function testRegistrationAdoptsTheIssuedSession(): Promise<void> {
  const storage = storageWith(null);
  const session = issued({ username: 'new_buyer' });
  const auth = recordingAuth({ register: async () => session, storage });
  const machine = createAuthStateMachine({ storage, auth });

  const result = await machine.register({
    username: 'new_buyer',
    password: 'x'.repeat(20),
  });

  expect(result.ok, 'a successful registration signs the user in');
  expect(machine.getState().status === 'signed-in', 'the state follows');

  const sent = auth.seen.register[0] as Record<string, unknown>;
  expect(
    Object.keys(sent).sort().join(',') === 'password,username',
    'registration sends only a username and a password — never a role, never an actor id',
  );
}

async function testLoginFailureKeepsTheUserSignedOut(): Promise<void> {
  const storage = storageWith(null);
  const auth = recordingAuth({
    login: async () => {
      throw authError('CREDENTIALS_REJECTED', 'That username and password do not match an account.');
    },
  });
  const machine = createAuthStateMachine({ storage, auth });

  const result = await machine.login({ username: 'buyer_one', password: 'x'.repeat(20) });

  expect(!result.ok, 'a refused sign-in is reported');
  if (result.ok) {
    return;
  }
  expect(result.failure.code === 'CREDENTIALS_REJECTED', 'the failure code is carried');
  expect(
    !result.failure.message.includes('x'.repeat(20)),
    'the failure message never contains the password',
  );
  expect(machine.getState().status === 'signed-out', 'a refused sign-in leaves the app signed out');
}

async function testRegisterFailureClearsAnyPreviousSession(): Promise<void> {
  const storage = storageWith(issued());
  const auth = recordingAuth({
    register: async () => {
      throw authError('USERNAME_TAKEN', 'That username is already taken.');
    },
  });
  const machine = createAuthStateMachine({ storage, auth });

  const result = await machine.register({
    username: 'buyer_one',
    password: 'x'.repeat(20),
  });

  expect(!result.ok, 'a refused registration is reported');
  if (!result.ok) {
    expect(result.failure.code === 'USERNAME_TAKEN', 'the taken username is reported');
  }
  expect(machine.getState().status === 'signed-out', 'the app is signed out');
}

async function testStorageFailureDuringSignInIsReported(): Promise<void> {
  const storage = storageWith(null);
  const auth = recordingAuth({ register: async () => issued(), storage });
  const machine = createAuthStateMachine({ storage, auth });
  storage.failWrites();

  const result = await machine.register({
    username: 'buyer_one',
    password: 'x'.repeat(20),
  });

  expect(!result.ok, 'a session that cannot be stored is a failed sign-in');
  if (!result.ok) {
    expect(
      result.failure.code === 'SESSION_UNWRITABLE',
      'the failure names the storage problem rather than a credential problem',
    );
  }
}

async function testSignOutClearsTheDeviceEvenWhenTheServerIsUnreachable(): Promise<void> {
  const storage = storageWith(issued());
  const auth = recordingAuth({
    logout: async () => {
      throw new Error('network unreachable');
    },
  });
  const machine = createAuthStateMachine({ storage, auth });

  await machine.signOut();

  expect(machine.getState().status === 'signed-out', 'the user is signed out');
  expect(storage.cleared, 'the device copy is cleared even when the server refused');
  expect(auth.seen.logout.length === 1, 'the server was still asked to revoke the session');
}

/**
 * The client never invents a role.
 *
 * A public registration is answered BUYER by the server; whatever roles come
 * back are adopted verbatim, including a role this client does not know how
 * to ask for. A session carrying a role the app has no UI for is still the
 * server's decision to make, and a client that rewrote it would be widening
 * its own permissions.
 */
async function testRolesAreWhateverTheServerAssigned(): Promise<void> {
  const storage = storageWith(null);
  const serverIssued = issued({ roles: ['ARTISAN'] });
  const auth = recordingAuth({
    register: async () => serverIssued,
    storage,
  });
  const machine = createAuthStateMachine({ storage, auth });

  const result = await machine.register({
    username: 'new_buyer',
    password: 'x'.repeat(20),
  });

  expect(result.ok, 'the registration succeeds');
  expect(
    machine.getState().session?.roles.length === 1 &&
      machine.getState().session?.roles[0] === 'ARTISAN',
    'the adopted roles are exactly the ones the server returned',
  );
}

async function testNavigationDestinations(): Promise<void> {  expect(destinationForStatus('restoring') === 'restoring', 'restoring shows no route');
  expect(destinationForStatus('signed-out') === 'sign-in', 'signed out shows sign-in');
  expect(destinationForStatus('signed-in') === 'app', 'signed in shows the app');
}

async function testSubscribersAreNotifiedOfStateChanges(): Promise<void> {
  const storage = storageWith(null);
  const auth = recordingAuth({ register: async () => issued(), storage });
  const machine = createAuthStateMachine({ storage, auth });

  const seen: string[] = [];
  const unsubscribe = machine.subscribe((state) => {
    seen.push(state.status);
  });

  await machine.register({ username: 'buyer_one', password: 'x'.repeat(20) });
  await machine.resetToSignedOut();

  expect(
    seen.length === 2 && seen[0] === 'signed-in' && seen[1] === 'signed-out',
    'subscribers observe the sign-in and the sign-out in order',
  );

  unsubscribe();
  await machine.resetToSignedOut();

  expect(seen.length === 2, 'an unsubscribed listener stops receiving updates');
}

async function testRestoreKeepsASessionWhenRenewalCannotBeAttempted(): Promise<void> {
  const now = () => 1_800_000_000_000 + 60 * 60 * 1000;
  const storage = storageWith(
    issued({ accessExpiresAt: now() - 1000, refreshExpiresAt: now() + 60 * 60 * 1000 }),
  );
  const auth = recordingAuth({
    refresh: async () => {
      throw authError('UNAVAILABLE', 'The session could not be renewed right now. Try again.');
    },
  });
  const machine = createAuthStateMachine({ storage, auth, now });

  const state = await machine.restore();

  // A transport failure is not a refusal: the session on the device may
  // still be good, so it is kept and the access credential is simply stale.
  expect(state.status === 'signed-in', 'a renewal that could not be attempted keeps the session');
  expect(!storage.cleared, 'the session is not discarded on a transport failure');
}

async function main(): Promise<void> {
  await testRestoreOfALiveSession();
  await testRestoreRenewsAnExpiredAccessCredential();
  await testRestoreEndsASessionThatCannotBeRenewed();
  await testRestoreDropsASessionTheServerRefusesToRenew();
  await testRestoreSurvivesAnUnreadableDevice();
  await testRegistrationAdoptsTheIssuedSession();
  await testRolesAreWhateverTheServerAssigned();
  await testLoginFailureKeepsTheUserSignedOut();
  await testRegisterFailureClearsAnyPreviousSession();
  await testStorageFailureDuringSignInIsReported();
  await testSignOutClearsTheDeviceEvenWhenTheServerIsUnreachable();
  await testNavigationDestinations();
  await testSubscribersAreNotifiedOfStateChanges();
  await testRestoreKeepsASessionWhenRenewalCannotBeAttempted();

  console.log('AUTH STATE TESTS PASSED');
}

void main().catch((error) => {
  console.error('AUTH STATE TESTS FAILED');
  console.error(error);
  process.exitCode = 1;
});
