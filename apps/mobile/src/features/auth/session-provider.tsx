/**
 * The app's session provider.
 *
 * This is the one place the app's real dependencies meet: the platform's
 * secure storage, the authentication transport, and the pure state machine
 * everything else uses. It exists so the screens can stay thin and so the
 * state machine remains testable in a plain Node process.
 *
 * Three startup rules:
 *
 * - The session client is installed once, before any request can be sent,
 *   so the transports' Authorization header is correct from the first
 *   request rather than only after a sign-in.
 * - Restoration happens before the app is shown. A device that holds a
 *   session sees the app; one that does not sees sign-in. A session that is
 *   merely unreadable signs the user out rather than trapping them on a
 *   screen they cannot act on.
 * - A build that cannot even construct the transport (no API URL) fails
 *   loudly here instead of presenting a sign-in that cannot succeed.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  createAuthStateMachine,
  type AuthState,
  type AuthStateMachine,
  type SignInResult,
} from './auth-state';
import {
  createSecureSessionStorage,
  type SecureStoreLike,
  type SessionStorage,
} from '../../security/session-storage';
import { HttpAuthTransport } from '../../network/auth-transport';
import {
  createSessionClient,
  installSessionClient,
  type SessionClient,
} from '../../network/authorization';

/**
 * The secure-store surface the app needs.
 *
 * Declared explicitly rather than reaching for `expo-secure-store`'s own
 * types so this module compiles wherever it is loaded, and so the storage
 * can be replaced wholesale by a test.
 */
const secureStore: SecureStoreLike = {
  getItemAsync: (key) => SecureStore.getItemAsync(key),
  setItemAsync: (key, value) => SecureStore.setItemAsync(key, value),
  deleteItemAsync: (key) => SecureStore.deleteItemAsync(key),
};

export type AuthContextValue = {
  state: AuthState;
  register(request: {
    username: string;
    password: string;
  }): Promise<SignInResult>;
  login(request: {
    username: string;
    password: string;
  }): Promise<SignInResult>;
  signOut(): Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);

  if (value === null) {
    throw new Error('useAuth was used outside the AuthProvider.');
  }

  return value;
}

export type AuthProviderProps = {
  children: React.ReactNode;
  /** Injected by tests; the app uses the platform's secure storage. */
  storage?: SessionStorage;
  /** Injected by tests; the app builds the shared HTTP stack. */
  client?: SessionClient;
};

export function AuthProvider({
  children,
  storage,
  client,
}: AuthProviderProps) {
  const theme = useTheme();
  const [machine, setMachine] = useState<AuthStateMachine | null>(null);
  const [state, setState] = useState<AuthState | null>(null);
  const [setupFailure, setSetupFailure] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) {
      return;
    }
    started.current = true;

    try {
      const sessionStorage =
        storage ?? createSecureSessionStorage(secureStore);

      const transport = new HttpAuthTransport(sessionStorage);

      installSessionClient(
        client ?? createSessionClient({ storage: sessionStorage, auth: transport }),
      );

      const next = createAuthStateMachine({
        storage: sessionStorage,
        auth: transport,
      });

      setMachine(next);

      void next.restore().catch(() => {
        // A restore that rejects is a device that cannot be read: the user
        // signs in again rather than facing a blank app.
        next.resetToSignedOut();
      });
    } catch (error) {
      setSetupFailure(
        error instanceof Error
          ? error.message
          : 'The app could not start its session.',
      );
    }
  }, [storage, client]);

  useEffect(() => {
    if (machine === null) {
      return;
    }

    setState(machine.getState());

    return machine.subscribe(setState);
  }, [machine]);

  const value = useMemo<AuthContextValue | null>(() => {
    if (machine === null || state === null) {
      return null;
    }

    return {
      state,
      register: (request) => machine.register(request),
      login: (request) => machine.login(request),
      signOut: () => machine.signOut(),
    };
  }, [machine, state]);

  if (setupFailure !== null) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <Text style={[styles.heading, { color: theme.text }]}>
          Sign-in is unavailable
        </Text>
        <Text style={[styles.body, { color: theme.textSecondary }]}>
          {setupFailure}
        </Text>
      </View>
    );
  }

  if (value === null) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator />
        <Text style={[styles.body, { color: theme.textSecondary }]}>
          Opening your session…
        </Text>
      </View>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * The gate itself. Nothing past this point is shown until the device's
 * session is known, and a device without one is sent to sign-in.
 */
export function AuthGate({
  children,
  signIn,
}: {
  children: React.ReactNode;
  signIn: React.ReactNode;
}) {
  const theme = useTheme();
  const { state } = useAuth();

  if (state.status === 'restoring') {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator />
        <Text style={[styles.body, { color: theme.textSecondary }]}>
          Opening your session…
        </Text>
      </View>
    );
  }

  return state.status === 'signed-in' ? (
    <>{children}</>
  ) : (
    <>{signIn}</>
  );
}

const styles = StyleSheet.create({
  body: {
    fontSize: 15,
    lineHeight: 22,
    paddingHorizontal: Spacing.four,
    textAlign: 'center',
  },
  centered: {
    alignItems: 'center',
    flex: 1,
    gap: Spacing.three,
    justifyContent: 'center',
  },
  heading: {
    fontSize: 20,
    fontWeight: '800',
  },
});
