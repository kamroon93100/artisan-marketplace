/**
 * Authentication transport.
 *
 * Corresponds to the server endpoints:
 *   POST /v1/auth/register
 *   POST /v1/auth/login
 *   POST /v1/auth/refresh
 *   POST /v1/auth/logout
 *
 * Two properties of the server contract this transport exists to honor:
 *
 * 1. The refresh credential is single-use and rotates. Every successful
 *    refresh issues a new pair and refuses the old refresh credential
 *    afterwards (a replay is answered 401 with `SESSION_REVOKED` and
 *    revokes that session). A client that keeps using a spent credential
 *    signs the artisan out, so the response of a successful refresh is
 *    always written back to storage before anything else happens.
 * 2. Credential failures are uniform: an unknown username and a wrong
 *    password are the same 401, and a refresh credential that is missing,
 *    invalid, expired, revoked, or replayed is also a 401. Only the replay
 *    case carries a reason. The transport therefore reports "signed out" or
 *    "credentials rejected" and never guesses which.
 *
 * No credential is ever written to a log or an error message.
 */

import { getApiBaseUrl } from '../config/api';
import type {
  SessionStorage,
  StoredSession,
} from '../security/session-storage';
import { redactSecrets } from '../security/redact-secrets';

/** The session the API issues, exactly as the server returns it. */
export type IssuedSessionResponse = {
  readonly sessionId: string;
  readonly accessToken: string;
  readonly refreshToken: string;
  /** Epoch milliseconds. */
  readonly accessExpiresAt: number;
  readonly refreshExpiresAt: number;
  readonly actor: {
    readonly actorId: string;
    readonly username: string;
    readonly roles: readonly string[];
  };
};

export type RegisterRequest = {
  readonly username: string;
  readonly password: string;
};

export type LoginRequest = {
  readonly username: string;
  readonly password: string;
};

export type RefreshRequest = {
  readonly refreshToken: string;
};

/** Errors surfaced for a refused or unreadable authentication attempt. */
export class AuthTransportError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'AuthTransportError';
  }
}

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9_.-]{2,29}$/;
export const PASSWORD_MIN_LENGTH = 15;
export const PASSWORD_MAX_LENGTH = 1024;

/**
 * Username rules are validated before a request is sent.
 *
 * The server's answer for a bad username is a 400 that names the field, and
 * for a username that is merely unknown it is the uniform 401. Sending a
 * username the client already knows is malformed would trade a specific
 * answer for a network round-trip.
 */
export function validateRegistration(request: RegisterRequest): void {
  const username = request.username.toLowerCase().trim();

  if (!USERNAME_PATTERN.test(username)) {
    throw new AuthTransportError(
      'Username must be 3-30 characters, start with a letter or number, and contain only lowercase letters, numbers, underscore, hyphen, or period.',
      'INVALID_CREDENTIALS',
      false,
    );
  }

  if (request.password.length < PASSWORD_MIN_LENGTH) {
    throw new AuthTransportError(
      `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
      'INVALID_CREDENTIALS',
      false,
    );
  }

  if (request.password.length > PASSWORD_MAX_LENGTH) {
    throw new AuthTransportError(
      'Password is too long.',
      'INVALID_CREDENTIALS',
      false,
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function unreadable(what: string): AuthTransportError {
  return new AuthTransportError(
    `The API returned a response the app cannot read: ${what}.`,
    'INVALID_SERVER_RESPONSE',
    false,
  );
}

/**
 * Parses an issued session, rejecting a payload that does not carry every
 * field the app depends on.
 *
 * A partially-present session is worse than a failure: the app would store
 * credentials it cannot later refresh, and the artisan would be signed out
 * at the moment the access credential expires.
 */
export function parseIssuedSession(value: unknown): IssuedSessionResponse {
  if (!isRecord(value)) {
    throw unreadable('the response body');
  }

  const session = value.session;
  if (!isRecord(session)) {
    throw unreadable('the response body has no session');
  }

  const actor = session.actor;
  if (!isRecord(actor)) {
    throw unreadable('the session has no actor');
  }

  const fields = {
    sessionId: session.sessionId,
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    accessExpiresAt: session.accessExpiresAt,
    refreshExpiresAt: session.refreshExpiresAt,
  };

  for (const [name, raw] of Object.entries(fields)) {
    if (name === 'sessionId' || name === 'accessToken' || name === 'refreshToken') {
      if (typeof raw !== 'string' || raw.length === 0) {
        throw unreadable(`the session ${name}`);
      }
    } else if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      throw unreadable(`the session ${name}`);
    }
  }

  if (typeof actor.actorId !== 'string' || actor.actorId.length === 0) {
    throw unreadable('the session actor id');
  }

  if (typeof actor.username !== 'string' || actor.username.length === 0) {
    throw unreadable('the session actor username');
  }

  const roles: string[] = [];
  if (!Array.isArray(actor.roles)) {
    throw unreadable('the session actor roles');
  }
  for (const role of actor.roles) {
    if (typeof role !== 'string') {
      throw unreadable('the session actor roles');
    }
    roles.push(role);
  }

  return {
    sessionId: fields.sessionId as string,
    accessToken: fields.accessToken as string,
    refreshToken: fields.refreshToken as string,
    accessExpiresAt: fields.accessExpiresAt as number,
    refreshExpiresAt: fields.refreshExpiresAt as number,
    actor: {
      actorId: actor.actorId as string,
      username: actor.username as string,
      roles,
    },
  };
}

/** The transport's shape; storage is supplied so it can be faked. */
export type AuthTransport = {
  register(request: RegisterRequest): Promise<StoredSession>;
  login(request: LoginRequest): Promise<StoredSession>;
  /** Returns the new pair, or `null` when the credential was refused. */
  refresh(refreshToken: string): Promise<StoredSession | null>;
  logout(refreshToken: string): Promise<void>;
};

function toStoredSession(session: IssuedSessionResponse): StoredSession {
  return {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    accessExpiresAt: session.accessExpiresAt,
    refreshExpiresAt: session.refreshExpiresAt,
    actorId: session.actor.actorId,
    username: session.actor.username,
    roles: session.actor.roles,
  };
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

/**
 * Reads an error body's code and message without echoing anything the
 * server said about the credentials. The message is redacted as defense in
 * depth: a misbehaving server must not be able to put a credential into the
 * app's logs through this path.
 */
function readApiError(body: unknown): { code: string; message: string } | null {
  if (!isRecord(body) || !isRecord(body.error)) {
    return null;
  }

  const code =
    typeof body.error.code === 'string' ? body.error.code : 'UNKNOWN';
  const message =
    typeof body.error.message === 'string' ? body.error.message : '';

  return { code, message: redactSecrets(message) };
}

export class HttpAuthTransport implements AuthTransport {
  constructor(
    private readonly storage: SessionStorage,
    private readonly fetchImpl?: typeof fetch,
    private readonly baseUrl: string = getApiBaseUrl(),
  ) {}

  /** Resolved per request, so a test can replace the global fetch late. */
  private get fetchFn(): typeof fetch {
    return this.fetchImpl ?? globalThis.fetch;
  }

  private async post(
    path: string,
    body: unknown,
    extraHeaders: Record<string, string> = {},
  ): Promise<{ status: number; parsed: unknown }> {
    const response = await this.fetchFn(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...extraHeaders,
      },
      body: JSON.stringify(body),
    });

    const text = await response.text();
    let parsed: unknown = null;

    try {
      parsed = text.length > 0 ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }

    return { status: response.status, parsed };
  }

  async register(request: RegisterRequest): Promise<StoredSession> {
    validateRegistration(request);

    const { status, parsed } = await this.post('/v1/auth/register', request);

    if (status === 201) {
      return this.establish(parseIssuedSession(parsed));
    }

    const apiError = readApiError(parsed);

    if (apiError?.code === 'CONFLICT') {
      throw new AuthTransportError(
        'That username is already taken.',
        'USERNAME_TAKEN',
        false,
      );
    }

    if (apiError?.code === 'VALIDATION_FAILED' && apiError.message) {
      throw new AuthTransportError(apiError.message, 'INVALID_CREDENTIALS', false);
    }

    if (isRetryableStatus(status)) {
      throw new AuthTransportError(
        'Registration could not be completed right now. Try again.',
        'UNAVAILABLE',
        true,
      );
    }

    throw new AuthTransportError(
      'Registration could not be completed.',
      'REGISTRATION_FAILED',
      false,
    );
  }

  async login(request: LoginRequest): Promise<StoredSession> {
    const { status, parsed } = await this.post('/v1/auth/login', request);

    if (status === 200) {
      return this.establish(parseIssuedSession(parsed));
    }

    if (status === 401) {
      // Uniform on the server and uniform here: a wrong password and an
      // unknown username are indistinguishable, and the app must not
      // invent a distinction it does not have.
      throw new AuthTransportError(
        'That username and password do not match an account.',
        'CREDENTIALS_REJECTED',
        false,
      );
    }

    if (isRetryableStatus(status)) {
      throw new AuthTransportError(
        'Sign-in could not be completed right now. Try again.',
        'UNAVAILABLE',
        true,
      );
    }

    throw new AuthTransportError(
      'Sign-in could not be completed.',
      'LOGIN_FAILED',
      false,
    );
  }

  async refresh(refreshToken: string): Promise<StoredSession | null> {
    const { status, parsed } = await this.post('/v1/auth/refresh', {
      refreshToken,
    });

    if (status === 200) {
      // The old credential is spent the moment this succeeds, so the new
      // pair is stored before this function returns. A caller that dropped
      // the response would be left holding a credential the server refuses.
      return this.establish(parseIssuedSession(parsed));
    }

    if (status === 401) {
      const apiError = readApiError(parsed);
      const detail =
        apiError && 'reason' in apiError
          ? (apiError as { reason?: string }).reason
          : undefined;

      void detail;
      // Every 401 here means the session is over: missing, invalid, expired,
      // revoked, or replayed. The stored session is dropped so the app asks
      // for credentials rather than repeating a refused refresh forever.
      await this.storage.clear();
      return null;
    }

    if (isRetryableStatus(status)) {
      throw new AuthTransportError(
        'The session could not be renewed right now. Try again.',
        'UNAVAILABLE',
        true,
      );
    }

    await this.storage.clear();
    return null;
  }

  async logout(refreshToken: string): Promise<void> {
    const { status } = await this.post('/v1/auth/logout', { refreshToken });

    // 200 is the server's answer, including a repeat of the same credential:
    // logout is idempotent, so a client that retries a logout it is not sure
    // completed is not forcing a second state change. Anything else still
    // clears local credentials: the device's copy is the thing this controls.
    await this.storage.clear();

    if (status === 200) {
      return;
    }

    if (isRetryableStatus(status)) {
      throw new AuthTransportError(
        'Sign-out could not be confirmed with the server. You are signed out on this device.',
        'UNAVAILABLE',
        true,
      );
    }
  }

  /**
   * Writes an issued session to storage and returns it. This is the one
   * place a successful authentication becomes a stored session, so a
   * storage failure surfaces as a failed sign-in rather than as a session
   * the app believes it has and the device cannot produce.
   */
  private async establish(
    session: IssuedSessionResponse,
  ): Promise<StoredSession> {
    const stored = toStoredSession(session);

    try {
      await this.storage.write(stored);
    } catch (error) {
      throw new AuthTransportError(
        `The session could not be stored on this device: ${
          error instanceof Error ? error.message : 'secure storage failed'
        }`,
        'SESSION_UNWRITABLE',
        false,
      );
    }

    return stored;
  }
}
