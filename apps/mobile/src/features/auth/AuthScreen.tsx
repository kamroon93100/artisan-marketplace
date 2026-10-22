/**
 * Sign in, and create an account.
 *
 * One screen with two modes rather than two screens: the fields are the same
 * two, and a buyer arriving for the first time should not have to find a
 * different screen to join. The mode is explicit and labelled, never a
 * guess made from whether a field is empty.
 *
 * What the screen deliberately does not do:
 *
 * - It never sends a role. Registration sends a username and a password and
 *   nothing else; the server assigns BUYER, and artisan permissions remain a
 *   server decision this client cannot influence.
 * - It never logs a credential. The password is held in component state and
 *   never leaves it except in the request body.
 * - It never distinguishes an unknown username from a wrong password, because
 *   the server does not: both are the same message.
 */

import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Colors, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { PASSWORD_MIN_LENGTH } from '../../network/auth-transport';
import { useAuth } from './session-provider';

type Mode = 'sign-in' | 'register';

export function AuthScreen() {
  const theme = useTheme();
  const { login, register } = useAuth();

  const [mode, setMode] = useState<Mode>('sign-in');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const submit = useCallback(async () => {
    setBusy(true);
    setFailure(null);

    const result =
      mode === 'register'
        ? await register({ username, password })
        : await login({ username, password });

    setBusy(false);

    if (!result.ok) {
      setFailure(result.failure.message);
    }
  }, [mode, username, password, register, login]);

  const switchMode = useCallback((next: Mode) => {
    setMode(next);
    setFailure(null);
  }, []);

  const passwordHint =
    mode === 'register'
      ? `At least ${PASSWORD_MIN_LENGTH} characters.`
      : null;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.screen, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        <View style={styles.copy}>
          <Text style={[styles.eyebrow, { color: theme.textSecondary }]}>
            ARTISAN MARKETPLACE
          </Text>
          <Text style={[styles.title, { color: theme.text }]}>
            {mode === 'register' ? 'Join the marketplace' : 'Welcome back'}
          </Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            {mode === 'register'
              ? 'Create an account to buy from artisans. Your work stays on this phone until you are ready.'
              : 'Sign in to continue with your drafts, listings and inquiries.'}
          </Text>
        </View>

        <View style={styles.form}>
          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>
              Username
            </Text>
            <TextInput
              accessibilityLabel="Username"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy}
              onChangeText={setUsername}
              placeholder="your.name"
              placeholderTextColor={theme.textSecondary}
              style={[
                styles.input,
                {
                  backgroundColor: theme.backgroundElement,
                  borderColor: theme.backgroundSelected,
                  color: theme.text,
                },
              ]}
              value={username}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>
              Password
            </Text>
            <TextInput
              accessibilityLabel="Password"
              editable={!busy}
              onChangeText={setPassword}
              placeholder="••••••••••••••"
              placeholderTextColor={theme.textSecondary}
              secureTextEntry
              style={[
                styles.input,
                {
                  backgroundColor: theme.backgroundElement,
                  borderColor: theme.backgroundSelected,
                  color: theme.text,
                },
              ]}
              value={password}
            />
            {passwordHint ? (
              <Text style={[styles.hint, { color: theme.textSecondary }]}>
                {passwordHint}
              </Text>
            ) : null}
          </View>

          {failure ? (
            <View
              accessibilityRole="alert"
              style={[
                styles.failure,
                {
                  backgroundColor: theme.backgroundElement,
                  borderColor: theme.backgroundSelected,
                },
              ]}>
              <Text style={[styles.failureText, { color: theme.text }]}>
                {failure}
              </Text>
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            disabled={busy || username.length === 0 || password.length === 0}
            onPress={() => void submit()}
            style={[
              styles.primary,
              { backgroundColor: theme.text },
              busy || username.length === 0 || password.length === 0
                ? styles.primaryDisabled
                : null,
            ]}>
            {busy ? (
              <ActivityIndicator color={theme.background} />
            ) : (
              <Text style={[styles.primaryText, { color: theme.background }]}>
                {mode === 'register' ? 'Create account' : 'Sign in'}
              </Text>
            )}
          </Pressable>

          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() =>
              switchMode(mode === 'register' ? 'sign-in' : 'register')
            }
            style={styles.secondary}>
            <Text style={[styles.secondaryText, { color: theme.text }]}>
              {mode === 'register'
                ? 'I already have an account'
                : 'Create an account'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: Spacing.four,
    paddingBottom: Spacing.six,
  },
  copy: {
    gap: Spacing.three,
    paddingBottom: Spacing.five,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  failure: {
    borderRadius: Spacing.three,
    borderWidth: 1,
    padding: Spacing.three,
  },
  failureText: {
    fontSize: 14,
    lineHeight: 20,
  },
  field: {
    gap: Spacing.one,
  },
  form: {
    gap: Spacing.four,
  },
  hint: {
    fontSize: 12,
  },
  input: {
    borderRadius: Spacing.three,
    borderWidth: 1,
    fontSize: 16,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
  },
  primary: {
    alignItems: 'center',
    borderRadius: Spacing.three,
    paddingVertical: Spacing.four,
  },
  primaryDisabled: {
    opacity: 0.4,
  },
  primaryText: {
    fontSize: 17,
    fontWeight: '800',
  },
  screen: {
    flex: 1,
  },
  secondary: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
  },
  secondaryText: {
    fontSize: 15,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -1,
  },
});

export default AuthScreen;
