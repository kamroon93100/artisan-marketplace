import { Stack } from 'expo-router/stack';
import { useOnboarding } from '@/features/onboarding/onboarding-context';

/**
 * Onboarding Stack
 *
 * This stack contains the 8-step onboarding flow for new users:
 * 1. Welcome & Splash
 * 2. Truly Unique Crafts
 * 3. Meet the Makers
 * 4. Craft Passions
 * 5. Aesthetic Style Quiz
 * 6. Ethical Craft Values
 * 7. Exclusive Drops & Alerts
 * 8. Collective Welcome Pass
 *
 * The stack is only shown to users who haven't completed onboarding.
 * After completion, users are directed to the Auth screen.
 */
export default function OnboardingLayout() {
  const { isCompleted } = useOnboarding();

  // If onboarding is already completed, don't render the stack
  // The AuthGate in the root layout will handle routing to the main app
  if (isCompleted) {
    return null;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'fade',
      }}
    >
      <Stack.Screen name="welcome-splash" />
      <Stack.Screen name="truly-unique-crafts" />
      <Stack.Screen name="meet-the-makers" />
      <Stack.Screen name="craft-passions" />
      <Stack.Screen name="aesthetic-style-quiz" />
      <Stack.Screen name="ethical-craft-values" />
      <Stack.Screen name="exclusive-drops-alerts" />
      <Stack.Screen name="collective-welcome-pass" />
    </Stack>
  );
}