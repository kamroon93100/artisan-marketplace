/**
 * The Authorization seam.
 *
 * Every server route that resolves an actor reads the `Authorization`
 * header, and in a deployment that can verify a session an absent
 * credential is a refusal, not a downgrade. The transports therefore send
 * the header when there is a session, and send nothing when there is not —
 * never an expired credential, which is refused the same way a forged one
 * is and tells the user nothing useful.
 *
 * The seam also owns renewal. The server's refresh credential is
 * single-use, so a renewal must persist the returned pair before it is
 * reported as the current session; that is what `ensureValidAccessToken`
 * does, and it is the only place the app turns a refresh into a usable
 * access credential.
 */

import type { StoredSession } from '../security/session-storage';
import {
  isAccessTokenExpired,
  isRefreshTokenExpired,
} from '../security/session-storage';
import type { AuthTransport } from './auth-transport';

export type SessionClient = {
  current(): Promise<StoredSession | null>;
  /** The access credential to send, refreshed if needed, or `null`. */
  ensureValidAccessToken(): Promise<string | null>;
  signOut(): Promise<void>;
};

/**
 * A session client over a storage and an auth transport.
 *
 * Renewal failure is not an error: it means the session is over, which is
 * reported by `current()` returning `null` after a successful clear. A
 * transport failure (a network problem) *is* an error, because the session
 * is probably still valid and the caller should be able to retry.
 */
export function createSessionClient(options: {
  storage: {
    read(): Promise<StoredSession | null>;
    write(session: StoredSession): Promise<void>;
    clear(): Promise<void>;
  };
  auth: AuthTransport;
  now?: () => number;
}): SessionClient {
  const now = options.now ?? (() => Date.now());

  return {
    async current() {
      const session = await options.storage.read();
      if (session === null) {
        return null;
      }

      if (!isRefreshTokenExpired(session, now())) {
        return session;
      }

      // The refresh credential has expired: the session cannot be renewed,
      // so it is not a session.
      await options.storage.clear();
      return null;
    },

    async ensureValidAccessToken() {
      const session = await options.storage.read();
      if (session === null) {
        return null;
      }

      if (!isAccessTokenExpired(session, now())) {
        return session.accessToken;
      }

      if (isRefreshTokenExpired(session, now())) {
        await options.storage.clear();
        return null;
      }

      // The old credential is spent the moment this succeeds, so the new pair
      // is persisted here as well as by the transport. A transport that
      // returned a pair without storing it would otherwise leave the device
      // holding a credential the server refuses, and the artisan would be
      // signed out at the next renewal.
      const renewed = await options.auth.refresh(session.refreshToken);
      if (renewed === null) {
        return null;
      }

      await options.storage.write(renewed);
      return renewed.accessToken;
    },

    async signOut() {
      const session = await options.storage.read();
      if (session !== null) {
        try {
          await options.auth.logout(session.refreshToken);
        } catch {
          // Sign-out on the device is what this guarantees; a server that
          // cannot be reached is reported by the caller, not by leaving the
          // session stored.
        }
      }
      await options.storage.clear();
    },
  };
}

/**
 * The installed client, or `null` when nobody has signed in yet.
 *
 * The app installs a secure-store-backed client once, at startup. Until
 * then — and in a test runner that never installs one — requests are sent
 * without a credential, which is exactly what an anonymous request is.
 */
let installed: SessionClient | null = null;

export function installSessionClient(client: SessionClient | null): void {
  installed = client;
}

export async function currentSession(): Promise<StoredSession | null> {
  return installed === null ? null : installed.current();
}

export async function signOut(): Promise<void> {
  if (installed !== null) {
    await installed.signOut();
  }
}

/**
 * The `Authorization` header for a request, or no header at all.
 *
 * Transport code spreads this into its own headers; a caller that has no
 * session gets an empty object, so the request goes out anonymous and the
 * server's 401 is the honest answer.
 */
export async function authorizationHeaders(): Promise<Record<string, string>> {
  if (installed === null) {
    return {};
  }

  try {
    const token = await installed.ensureValidAccessToken();
    return token === null ? {} : { authorization: `Bearer ${token}` };
  } catch {
    // A renewal that could not be attempted leaves the request anonymous
    // rather than sending a credential that may already be refused.
    return {};
  }
}
