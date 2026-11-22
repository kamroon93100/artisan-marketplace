import { DarkTheme, DefaultTheme, ThemeProvider, Stack } from 'expo-router';
import { useColorScheme } from 'react-native';

import { AuthProvider } from '@/features/auth/session-provider';
import { OnboardingProvider } from '@/features/onboarding/onboarding-context';

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <OnboardingProvider>
        <AuthProvider>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(onboarding)" />
            <Stack.Screen name="(home)" />
            <Stack.Screen name="explore" />
          </Stack>
        </AuthProvider>
      </OnboardingProvider>
    </ThemeProvider>
  );
}