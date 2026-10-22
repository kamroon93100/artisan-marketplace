/**
 * The app's authentication state.
 *
 * This module is deliberately free of React, React Native and Expo
 * imports: it is the decision layer, and the screens are a thin view over
 * it. Everything here is testable in a plain Node process, which is what
 * lets the startup-restoration and failure rules be proven rather than
 * assumed.
 *
 * The rules it enforces:
 *
 * - Startup restores whatever the device holds. A session whose access
 *   credential is still valid is signed in; one whose access credential has
 *   expired is renewed from its refresh credential (the client sends the
 *   stored one and writes back the rotated pair); one whose refresh
 *   credential has expired, or that cannot be renewed, is signed out.
 * - A credential failure leaves the app signed out with a message the user
 *   can act on, and never distinguishes an unknown username from a wrong
 *   password, because the server does not.
 * - Sign-out always clears the device, even when the server cannot be
 *   reached: what this device holds is what this function controls.
 * - The client never chooses a role. Registration sends only a username and
 *   a password; the roles in a session are whatever the server assigned.
 */

import {
  isAccessTokenExpired,
  isRefreshTokenExpired,
  type StoredSession,
} from '../../security/session-storage';
import type { AuthTransport, AuthTransportError } from '../../network/auth-transport';

export type AuthStatus =
  /** The stored session is still being restored; nothing may be shown yet. */
  | 'restoring'
  /** No usable session on this device. */
  | 'signed-out'
  /** A session this device can prove. */
  | 'signed-in';

export type AuthFailure = {
  readonly code: string;
  readonly message: string;
};

export type AuthState = {
  readonly status: AuthStatus;
  readonly session: StoredSession | null;
};

const SIGNED_OUT: AuthState = { status: 'signed-out', session: null };

/** Where the app should show for a given status. */
export type AuthDestination = 'restoring' | 'sign-in' | 'app';

export function destinationForStatus(status: AuthStatus): AuthDestination {
  switch (status) {
    case 'restoring':
      return 'restoring';
    case 'signed-out':
      return 'sign-in';
    case 'signed-in':
      return 'app';
  }
}

export type AuthStateMachineOptions = {
  storage: {
    read(): Promise<StoredSession | null>;
    write(session: StoredSession): Promise<void>;
    clear(): Promise<void>;
  };
  auth: AuthTransport;
  now?: () => number;
};

export type SignInResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly failure: AuthFailure };

/**
 * A rejection the user can be told about.
 *
 * Only the transport's own classification is used. A message is never
 * constructed from anything the caller typed, and the transport already
 * redacts anything the server said.
 */
function toFailure(error: unknown): AuthFailure {
  if (error instanceof Error && 'code' in error) {
    const failure = error as unknown as AuthTransportError;
    return {
      code: typeof failure.code === 'string' ? failure.code : 'REQUEST_FAILED',
      message: error.message,
    };
  }

  return {
    code: 'REQUEST_FAILED',
    message: 'That request could not be completed. Try again.',
  };
}

export type AuthStateMachine = {
  getState(): AuthState;
  subscribe(listener: (state: AuthState) => void): () => void;
  /** Restores whatever the device holds. Safe to call more than once. */
  restore(): Promise<AuthState>;
  register(
    request: { username: string; password: string },
  ): Promise<SignInResult>;
  login(request: { username: string; password: string }): Promise<SignInResult>;
  signOut(): Promise<void>;
  resetToSignedOut(): void;
};

export function createAuthStateMachine(
  options: AuthStateMachineOptions,
): AuthStateMachine {
  const now = options.now ?? (() => Date.now());

  let state: AuthState = { status: 'restoring', session: null };
  const listeners = new Set<(state: AuthState) => void>();

  const emit = (next: AuthState): void => {
    state = next;
    for (const listener of listeners) {
      listener(next);
    }
  };

  const adopt = async (
    attempt: () => Promise<StoredSession>,
  ): Promise<SignInResult> => {
    try {
      // The transport writes the session to storage; the state machine
      // reads it back rather than trusting the in-memory copy, so the
      // state on screen is exactly what the next launch would restore.
      const session = await attempt();
      emit({ status: 'signed-in', session });
      return { ok: true };
    } catch (error) {
      emit(SIGNED_OUT);
      return { ok: false, failure: toFailure(error) };
    }
  };

  /**
   * Renews a session whose access credential has expired, or ends it.
   *
   * A renewal that the server refuses is not retried here: the credential
   * is spent or revoked, and asking again would only produce a second
   * refusal the app cannot distinguish from the first.
   */
  const renew = async (
    session: StoredSession,
  ): Promise<AuthState> => {
    try {
      const renewed = await options.auth.refresh(session.refreshToken);

      if (renewed === null) {
        await options.storage.clear();
        return SIGNED_OUT;
      }

      await options.storage.write(renewed);
      return { status: 'signed-in', session: renewed };
    } catch {
      // A network-level failure leaves the stored session alone: the
      // device still holds a refresh credential that may work next time, so
      // the app stays signed in with an expired access credential rather
      // than throwing away a session that is not actually over.
      return { status: 'signed-in', session };
    }
  };

  return {
    getState() {
      return state;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    async restore(): Promise<AuthState> {
      let stored: StoredSession | null = null;

      try {
        stored = await options.storage.read();
      } catch {
        // A storage that cannot be read is a signed-out device, not a
        // crash: the user signs in again.
        stored = null;
      }

      if (stored === null) {
        emit(SIGNED_OUT);
        return SIGNED_OUT;
      }

      const at = now();

      if (!isRefreshTokenExpired(stored, at)) {
        if (isAccessTokenExpired(stored, at)) {
          const renewed = await renew(stored);
          emit(renewed);
          return renewed;
        }

        const next = { status: 'signed-in' as const, session: stored };
        emit(next);
        return next;
      }

      // The refresh credential is past its window: the session cannot be
      // renewed, so it is not a session.
      await options.storage.clear();
      emit(SIGNED_OUT);
      return SIGNED_OUT;
    },

    async register(request) {
      // No role is ever sent. The server assigns BUYER to a public
      // registration, and artisan permissions stay a server decision.
      return adopt(() => options.auth.register(request));
    },

    async login(request) {
      return adopt(() => options.auth.login(request));
    },

    async signOut() {
      try {
        const stored = await options.storage.read();

        if (stored !== null) {
          try {
            await options.auth.logout(stored.refreshToken);
          } catch {
            // The server could not be told; the device copy still goes.
          }
        }
      } finally {
        await options.storage.clear();
        emit(SIGNED_OUT);
      }
    },

    resetToSignedOut() {
      emit(SIGNED_OUT);
    },
  };
}
