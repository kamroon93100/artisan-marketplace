/**
 * Where a signed-in buyer's or artisan's credentials live on the device.
 *
 * The session is two credentials with different jobs and different
 * lifetimes: a short-lived access credential that travels in the
 * `Authorization` header, and a rotating refresh credential that buys a new
 * pair when the first expires. Both are bearer credentials, so both are
 * stored with the platform's secure storage rather than in ordinary app
 * storage, and neither is ever written to a log: the redaction helper is
 * applied at every call site that could print one.
 *
 * The port is deliberately an interface. The app resolves the secure-store
 * implementation once; tests and any environment without secure storage
 * (a web target, for instance) resolve an in-memory one. A missing
 * implementation is a configuration fault that is reported as one rather
 * than silently falling back to insecure storage.
 */

/** The credentials a stored session holds. */
export type StoredSession = {
  readonly accessToken: string;
  readonly refreshToken: string;
  /** Epoch milliseconds when the access credential stops being accepted. */
  readonly accessExpiresAt: number;
  /** Epoch milliseconds when the refresh credential stops being accepted. */
  readonly refreshExpiresAt: number;
  readonly actorId: string;
  readonly username: string;
  readonly roles: readonly string[];
};

/**
 * The storage the app needs for a session.
 *
 * `read` returns `null` for "no session", which includes absent, unreadable,
 * or unparsable stored contents: a session the app cannot read is not a
 * session, and the caller falls back to signing in.
 */
export type SessionStorage = {
  read(): Promise<StoredSession | null>;
  write(session: StoredSession): Promise<void>;
  clear(): Promise<void>;
};

/** Errors surfaced when secure storage itself cannot be used. */
export class SessionStorageError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'SessionStorageError';
  }
}

const ACCESS_TOKEN_KEY = 'artisan.session.access';
const REFRESH_TOKEN_KEY = 'artisan.session.refresh';
const ACCESS_EXPIRES_AT_KEY = 'artisan.session.accessExpiresAt';
const REFRESH_EXPIRES_AT_KEY = 'artisan.session.refreshExpiresAt';
const ACTOR_ID_KEY = 'artisan.session.actorId';
const USERNAME_KEY = 'artisan.session.username';
const ROLES_KEY = 'artisan.session.roles';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readRoles(value: unknown): readonly string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const roles: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') {
      return null;
    }
    roles.push(entry);
  }

  return roles;
}

/**
 * In-memory storage for tests and for targets without secure storage.
 *
 * It is deliberately not the default for the app: a session that lives in
 * plain process memory is lost on every restart, which would silently sign
 * the artisan out and lose an in-progress capture.
 */
export function createInMemorySessionStorage(): SessionStorage {
  let session: StoredSession | null = null;

  return {
    async read() {
      return session;
    },
    async write(next) {
      session = next;
    },
    async clear() {
      session = null;
    },
  };
}

/**
 * Secure-store-backed storage for the app.
 *
 * `expo-secure-store` is injected rather than imported so that this module
 * stays loadable in a test runner (and in a bundle that has not installed
 * the native module) — importing it directly would make every consumer of
 * session storage require the native module at import time.
 */
export type SecureStoreLike = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
};

export function createSecureSessionStorage(
  store: SecureStoreLike,
): SessionStorage {
  const readField = async (
    key: string,
    what: string,
  ): Promise<string> => {
    try {
      const value = await store.getItemAsync(key);
      const text = readString(value);
      if (text === null) {
        throw new SessionStorageError(
          `Stored session is missing its ${what}.`,
          'SESSION_UNREADABLE',
        );
      }
      return text;
    } catch (error) {
      if (error instanceof SessionStorageError) {
        throw error;
      }
      throw new SessionStorageError(
        `The stored session could not be read (${what}).`,
        'SESSION_UNREADABLE',
      );
    }
  };

  const readEpoch = async (
    key: string,
    what: string,
  ): Promise<number> => {
    const text = await readField(key, what);
    const value = Number(text);
    if (!Number.isFinite(value)) {
      throw new SessionStorageError(
        `Stored session ${what} is not a valid time.`,
        'SESSION_UNREADABLE',
      );
    }
    return value;
  };

  const writeField = async (
    key: string,
    value: string,
    what: string,
  ): Promise<void> => {
    try {
      await store.setItemAsync(key, value);
    } catch (error) {
      throw new SessionStorageError(
        `The session ${what} could not be stored: ${
          error instanceof Error ? error.message : 'secure storage failed'
        }`,
        'SESSION_UNWRITABLE',
      );
    }
  };

  return {
    async read() {
      try {
        // The access credential is the marker for "a session is stored": a
        // payload with no access credential is not a session.
        const accessToken = await readField(ACCESS_TOKEN_KEY, 'access credential');

        const session: StoredSession = {
          accessToken,
          refreshToken: await readField(REFRESH_TOKEN_KEY, 'refresh credential'),
          accessExpiresAt: await readEpoch(ACCESS_EXPIRES_AT_KEY, 'access expiry'),
          refreshExpiresAt: await readEpoch(REFRESH_EXPIRES_AT_KEY, 'refresh expiry'),
          actorId: await readField(ACTOR_ID_KEY, 'actor id'),
          username: await readField(USERNAME_KEY, 'username'),
          roles: readRoles(
            JSON.parse(await readField(ROLES_KEY, 'roles')),
          ) ?? [],
        };

        return session;
      } catch {
        // A session the app cannot read is not a session. Clearing it here
        // keeps a corrupt payload from failing every later request, and the
        // user is asked to sign in, which is recoverable.
        return null;
      }
    },

    async write(session) {
      await writeField(ACCESS_TOKEN_KEY, session.accessToken, 'access credential');
      await writeField(REFRESH_TOKEN_KEY, session.refreshToken, 'refresh credential');
      await writeField(ACCESS_EXPIRES_AT_KEY, String(session.accessExpiresAt), 'access expiry');
      await writeField(REFRESH_EXPIRES_AT_KEY, String(session.refreshExpiresAt), 'refresh expiry');
      await writeField(ACTOR_ID_KEY, session.actorId, 'actor id');
      await writeField(USERNAME_KEY, session.username, 'username');
      await writeField(ROLES_KEY, JSON.stringify(session.roles), 'roles');
    },

    async clear() {
      for (const key of [
        ACCESS_TOKEN_KEY,
        REFRESH_TOKEN_KEY,
        ACCESS_EXPIRES_AT_KEY,
        REFRESH_EXPIRES_AT_KEY,
        ACTOR_ID_KEY,
        USERNAME_KEY,
        ROLES_KEY,
      ]) {
        try {
          await store.deleteItemAsync(key);
        } catch {
          // Clearing is best-effort: a value the platform refuses to delete
          // is still overwritten by the next sign-in.
        }
      }
    },
  };
}

/**
 * Whether a stored session's access credential has expired.
 *
 * A small lead time is applied so a request is never sent with a credential
 * that expires between the check and the server reading it.
 */
export function isAccessTokenExpired(
  session: StoredSession,
  now: number,
  leadMs = 5000,
): boolean {
  return session.accessExpiresAt - leadMs <= now;
}

/** Whether a stored session's refresh credential has expired. */
export function isRefreshTokenExpired(
  session: StoredSession,
  now: number,
): boolean {
  return session.refreshExpiresAt <= now;
}

/** Guards a parsed session value coming off the wire. */
export function isStoredSession(value: unknown): value is StoredSession {
  if (!isRecord(value)) {
    return false;
  }

  return (
    readString(value.accessToken) !== null &&
    readString(value.refreshToken) !== null &&
    readNumber(value.accessExpiresAt) !== null &&
    readNumber(value.refreshExpiresAt) !== null &&
    readString(value.actorId) !== null &&
    readString(value.username) !== null &&
    readRoles(value.roles) !== null
  );
}
