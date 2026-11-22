import { DarkTheme, DefaultTheme, ThemeProvider, Stack } from 'expo-router';
import { useColorScheme } from 'react-native';

import AppTabs from '@/components/app-tabs';
import { AuthGate, AuthProvider } from '@/features/auth/session-provider';
import AuthScreen from '@/features/auth/AuthScreen';
import { OnboardingProvider } from '@/features/onboarding/onboarding-context';

/**
 * The app's root.
 *
 * The session provider comes before anything that can make a request, and
 * the gate sits between the two halves of the app: a device with a session
 * gets the tabs, a device without one gets sign-in. Nothing else about the
 * app changes — the existing screens are reached exactly as before, only
 * once there is a session to make requests with.
 *
 * Onboarding flow is shown BEFORE AuthGate for new users who haven't completed it.
 * After onboarding completion, users proceed to AuthGate (sign-in or main app).
 */
export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <OnboardingProvider>
        <AuthProvider>
          {/* Onboarding stack for first-time users */}
          <Stack.Screen name="(onboarding)" />
          <AuthGate signIn={<AuthScreen />}>
            <AppTabs />
          </AuthGate>
        </AuthProvider>
      </OnboardingProvider>
    </ThemeProvider>
  );
}