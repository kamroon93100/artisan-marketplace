import { Stack } from 'expo-router';

/**
 * The buyer's inquiry history stack.
 *
 * Headers are hidden because the screen carries its own back affordance,
 * matching the discovery stack's convention.
 */
export default function InquiriesLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
