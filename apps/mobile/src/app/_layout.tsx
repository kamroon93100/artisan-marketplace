import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';

import AppTabs from '@/components/app-tabs';
import { AuthGate, AuthProvider } from '@/features/auth/session-provider';
import AuthScreen from '@/features/auth/AuthScreen';


/**
 * The app's root.
 *
 * The session provider comes before anything that can make a request, and
 * the gate sits between the two halves of the app: a device with a session
 * gets the tabs, a device without one gets sign-in. Nothing else about the
 * app changes — the existing screens are reached exactly as before, only
 * once there is a session to make requests with.
 */
export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        <AuthGate signIn={<AuthScreen />}>
          <AppTabs />
        </AuthGate>
      </AuthProvider>
    </ThemeProvider>
  );
}
